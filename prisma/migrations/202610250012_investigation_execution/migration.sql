BEGIN;
ALTER TABLE investigation_events
  ADD COLUMN recovery_plan_id uuid, ADD COLUMN recovery_collector_id uuid, ADD COLUMN recovery_charge_id uuid,
  ADD FOREIGN KEY(recovery_plan_id, gym_id) REFERENCES plans(id, gym_id),
  ADD FOREIGN KEY(recovery_collector_id, gym_id) REFERENCES gym_operators(id, gym_id),
  ADD FOREIGN KEY(recovery_charge_id, gym_id) REFERENCES charge_snapshots(id, gym_id),
  ADD COLUMN independent_evidence_reference text,
  ADD COLUMN same_obligation boolean,
  ADD COLUMN unintended_collection boolean,
  ADD COLUMN adjusted_starts_at timestamptz(3), ADD COLUMN adjusted_ends_at timestamptz(3),
  ADD COLUMN approval_event_id uuid, ADD COLUMN execution_event_id uuid,
  ADD COLUMN settlement_reference text, ADD COLUMN settled_at timestamptz(3),
  ADD FOREIGN KEY(approval_event_id, gym_id) REFERENCES investigation_events(id, gym_id),
  ADD FOREIGN KEY(execution_event_id, gym_id) REFERENCES investigation_events(id, gym_id);
-- Replace only the state vocabulary/review checks; all original request checks remain.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid = 'investigation_events'::regclass AND contype = 'c' LOOP
    IF c.definition LIKE '%kind = ANY%' OR c.definition LIKE '%outcome = ANY%'
      OR (c.definition LIKE '%REVIEW%' AND c.definition LIKE '%APPROVED_BLOCKED%') THEN
      EXECUTE format('ALTER TABLE investigation_events DROP CONSTRAINT %I', c.conname);
    END IF;
  END LOOP;
END $$;
ALTER TABLE investigation_events
  ADD CHECK(kind IN ('OPEN','NOTE','ESCALATE','LINK','REQUEST','REVIEW','APPROVE_RECOVERY','RECOVER','EXECUTE_APPROVED','SETTLE')),
  ADD CHECK(outcome IN ('OPEN','ESCALATED','MATCHED','OWNER_REVIEW','APPROVED_BLOCKED','APPROVED','REJECTED','RECOVERED','COMPLETED','AWAITING_SETTLEMENT')),
  ADD CHECK(kind <> 'REVIEW' OR (request_event_id IS NOT NULL AND decision IS NOT NULL AND
    ((decision = 'APPROVE' AND outcome IN ('APPROVED','APPROVED_BLOCKED')) OR (decision = 'REJECT' AND outcome = 'REJECTED')))),
  ADD CHECK(kind NOT IN ('RECOVER','EXECUTE_APPROVED','SETTLE') OR
    (independent_evidence_reference IS NOT NULL AND independent_evidence_reference <> evidence_reference)),
  ADD CHECK(kind <> 'RECOVER' OR (payment_id IS NOT NULL AND outcome = 'RECOVERED')),
  ADD CHECK(kind <> 'EXECUTE_APPROVED' OR (payment_id IS NOT NULL AND request_event_id IS NOT NULL AND approval_event_id IS NOT NULL
    AND outcome IN ('COMPLETED','AWAITING_SETTLEMENT'))),
  ADD CHECK(kind <> 'SETTLE' OR (execution_event_id IS NOT NULL AND settlement_reference IS NOT NULL AND settled_at IS NOT NULL AND outcome = 'COMPLETED'));
CREATE UNIQUE INDEX investigation_one_recovery ON investigation_events(case_id) WHERE kind = 'RECOVER';
CREATE UNIQUE INDEX investigation_one_execution ON investigation_events(request_event_id) WHERE kind = 'EXECUTE_APPROVED';
CREATE UNIQUE INDEX investigation_one_adjustment_per_payment ON investigation_events(payment_id) WHERE kind = 'EXECUTE_APPROVED';
CREATE UNIQUE INDEX investigation_one_settlement ON investigation_events(execution_event_id) WHERE kind = 'SETTLE';
CREATE UNIQUE INDEX investigation_settlement_reference ON investigation_events(gym_id, settlement_reference) WHERE kind = 'SETTLE';

CREATE FUNCTION public.validate_investigation_execution() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE a public.investigation_events; r public.investigation_events;
BEGIN
  IF NEW.kind IN ('APPROVE_RECOVERY','RECOVER','EXECUTE_APPROVED','SETTLE') AND NOT EXISTS
    (SELECT 1 FROM public.gym_operators WHERE id = NEW.actor_id AND gym_id = NEW.gym_id AND role = 'OWNER' AND state = 'ACTIVE') THEN
    RAISE EXCEPTION 'Execution requires an active owner';
  END IF;
  IF NEW.kind = 'EXECUTE_APPROVED' THEN
    SELECT * INTO a FROM public.investigation_events WHERE id = NEW.approval_event_id AND gym_id = NEW.gym_id AND case_id = NEW.case_id AND kind = 'REVIEW' AND decision = 'APPROVE' AND outcome = 'APPROVED';
    SELECT * INTO r FROM public.investigation_events WHERE id = NEW.request_event_id AND gym_id = NEW.gym_id AND case_id = NEW.case_id AND kind = 'REQUEST';
    IF a.id IS NULL OR r.id IS NULL OR a.request_event_id <> r.id OR NEW.payment_id <> r.payment_id THEN
      RAISE EXCEPTION 'Execution requires exact approved request';
    END IF;
  ELSIF NEW.kind = 'SETTLE' THEN
    SELECT * INTO a FROM public.investigation_events WHERE id = NEW.execution_event_id AND gym_id = NEW.gym_id AND case_id = NEW.case_id AND kind = 'EXECUTE_APPROVED' AND outcome = 'AWAITING_SETTLEMENT';
    IF a.id IS NULL THEN RAISE EXCEPTION 'Settlement requires pending execution'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER investigation_execution_guard BEFORE INSERT ON investigation_events FOR EACH ROW EXECUTE FUNCTION public.validate_investigation_execution();

-- Only the derived projection changes. Immutable originals and execution events retain prior values.
GRANT UPDATE (starts_at, ends_at, is_current_projection) ON effective_entitlement_intervals TO gym_runtime;
CREATE FUNCTION public.guard_entitlement_adjustment() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT OLD.is_current_projection OR NOT EXISTS (
    SELECT 1 FROM public.investigation_events e JOIN public.investigation_events r ON r.id = e.request_event_id AND r.gym_id = e.gym_id
    WHERE e.kind = 'EXECUTE_APPROVED' AND e.gym_id = OLD.gym_id AND r.period_id = OLD.period_id
      AND ((r.access_outcome = 'ENDS' AND
          ((r.effective_at <= OLD.starts_at AND NOT NEW.is_current_projection AND NEW.starts_at = OLD.starts_at AND NEW.ends_at = OLD.ends_at)
          OR (r.effective_at > OLD.starts_at AND r.effective_at < OLD.ends_at AND NEW.is_current_projection AND NEW.starts_at = OLD.starts_at AND NEW.ends_at = r.effective_at)))
        OR (r.access_outcome = 'ADJUSTS' AND NEW.is_current_projection AND NEW.starts_at = r.adjusted_starts_at AND NEW.ends_at = r.adjusted_ends_at))
  ) THEN RAISE EXCEPTION 'Projection change requires an explicit executed owner adjustment'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER entitlement_adjustment_guard BEFORE UPDATE ON effective_entitlement_intervals FOR EACH ROW EXECUTE FUNCTION public.guard_entitlement_adjustment();
COMMIT;
