BEGIN;
CREATE TABLE investigation_cases (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), member_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('MISSING_PAYMENT','DUPLICATE_RECORD','TWO_COLLECTIONS','INCORRECT_ENTRY','CANCEL_BEFORE_USE','CANCEL_AFTER_USE','FUNDS_ABSENT')),
  summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 500),
  method text NOT NULL CHECK (method IN ('CASH','GCASH','BANK','UNKNOWN')),
  claimed_centavos integer CHECK (claimed_centavos > 0), original_collected_at timestamptz(3),
  opened_by uuid NOT NULL, opened_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id, gym_id), FOREIGN KEY(member_id, gym_id) REFERENCES members(id, gym_id),
  FOREIGN KEY(opened_by, gym_id) REFERENCES gym_operators(id, gym_id)
);
CREATE INDEX investigation_cases_gym_opened_idx ON investigation_cases(gym_id, opened_at);
CREATE TABLE investigation_events (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), case_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0), operation_key uuid NOT NULL, fingerprint text NOT NULL CHECK(length(fingerprint) = 64),
  kind text NOT NULL CHECK(kind IN ('OPEN','NOTE','ESCALATE','LINK','REQUEST','REVIEW')),
  outcome text NOT NULL CHECK(outcome IN ('OPEN','ESCALATED','MATCHED','OWNER_REVIEW','APPROVED_BLOCKED','REJECTED')),
  reasoning text NOT NULL CHECK(length(reasoning) BETWEEN 1 AND 500),
  evidence_reference text CHECK(length(evidence_reference) BETWEEN 1 AND 100),
  actor_id uuid NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_id uuid, related_payment_id uuid,
  reason text CHECK(reason IN ('DUPLICATE_RECORD','TWO_COLLECTIONS','INCORRECT_ENTRY','CANCEL_BEFORE_USE','CANCEL_AFTER_USE','FUNDS_ABSENT')),
  collection_count text CHECK(collection_count IN ('ONE','TWO','UNKNOWN')), amount_centavos integer CHECK(amount_centavos >= 0),
  method text CHECK(method IN ('CASH','GCASH','BANK')),
  money_outcome text CHECK(money_outcome IN ('NO_MOVEMENT','REFUND_PROPOSED','CORRECTION_PROPOSED')),
  access_outcome text CHECK(access_outcome IN ('STAYS','ENDS','ADJUSTS')), effective_at timestamptz(3),
  period_id uuid, retained_period_id uuid, request_event_id uuid, decision text CHECK(decision IN ('APPROVE','REJECT')),
  UNIQUE(id, gym_id), UNIQUE(gym_id, operation_key), UNIQUE(case_id, revision),
  FOREIGN KEY(case_id, gym_id) REFERENCES investigation_cases(id, gym_id),
  FOREIGN KEY(actor_id, gym_id) REFERENCES gym_operators(id, gym_id),
  FOREIGN KEY(payment_id, gym_id) REFERENCES payments(id, gym_id),
  FOREIGN KEY(related_payment_id, gym_id) REFERENCES payments(id, gym_id),
  FOREIGN KEY(period_id, gym_id) REFERENCES membership_periods(id, gym_id),
  FOREIGN KEY(retained_period_id, gym_id) REFERENCES membership_periods(id, gym_id),
  FOREIGN KEY(request_event_id, gym_id) REFERENCES investigation_events(id, gym_id),
  CHECK(kind = 'OPEN' OR evidence_reference IS NOT NULL),
  CHECK(kind <> 'LINK' OR (payment_id IS NOT NULL AND outcome = 'MATCHED')),
  CHECK(kind <> 'REQUEST' OR (payment_id IS NOT NULL AND reason IS NOT NULL AND collection_count IS NOT NULL
    AND amount_centavos IS NOT NULL AND method IS NOT NULL AND money_outcome IS NOT NULL AND access_outcome IS NOT NULL
    AND effective_at IS NOT NULL AND period_id IS NOT NULL AND outcome = 'OWNER_REVIEW')),
  CHECK(kind <> 'REQUEST' OR ((money_outcome = 'NO_MOVEMENT' AND amount_centavos = 0) OR (money_outcome <> 'NO_MOVEMENT' AND amount_centavos > 0))),
  CHECK(kind <> 'REQUEST' OR reason <> 'DUPLICATE_RECORD' OR (collection_count = 'ONE' AND money_outcome = 'NO_MOVEMENT' AND related_payment_id IS NOT NULL AND retained_period_id IS NOT NULL)),
  CHECK(kind <> 'REQUEST' OR reason <> 'TWO_COLLECTIONS' OR (collection_count = 'TWO' AND related_payment_id IS NOT NULL)),
  CHECK(kind <> 'REVIEW' OR (request_event_id IS NOT NULL AND decision IS NOT NULL
    AND ((decision = 'APPROVE' AND outcome = 'APPROVED_BLOCKED') OR (decision = 'REJECT' AND outcome = 'REJECTED'))))
);
CREATE UNIQUE INDEX investigation_one_review_idx ON investigation_events(request_event_id) WHERE kind = 'REVIEW';

CREATE FUNCTION public.validate_investigation_event() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE c public.investigation_cases; r public.investigation_events;
BEGIN
  SELECT * INTO c FROM public.investigation_cases WHERE id = NEW.case_id AND gym_id = NEW.gym_id;
  IF c.id IS NULL OR (NEW.payment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.payments WHERE id = NEW.payment_id AND gym_id = NEW.gym_id AND member_id = c.member_id))
    OR (NEW.related_payment_id IS NOT NULL AND (NEW.related_payment_id = NEW.payment_id OR NOT EXISTS (SELECT 1 FROM public.payments WHERE id = NEW.related_payment_id AND gym_id = NEW.gym_id AND member_id = c.member_id)))
    OR (NEW.period_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.membership_periods WHERE id = NEW.period_id AND gym_id = NEW.gym_id AND payment_id = NEW.payment_id AND member_id = c.member_id))
    OR (NEW.retained_period_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.membership_periods WHERE id = NEW.retained_period_id AND gym_id = NEW.gym_id AND payment_id = NEW.related_payment_id AND member_id = c.member_id)) THEN
    RAISE EXCEPTION 'Case references must match the tenant, member and payment';
  END IF;
  IF NEW.kind = 'REVIEW' THEN
    SELECT * INTO r FROM public.investigation_events WHERE id = NEW.request_event_id AND gym_id = NEW.gym_id AND case_id = NEW.case_id AND kind = 'REQUEST';
    IF r.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.gym_operators WHERE id = NEW.actor_id AND gym_id = NEW.gym_id AND role = 'OWNER' AND state = 'ACTIVE') THEN
      RAISE EXCEPTION 'Review requires the same case request and an active owner';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER investigation_event_guard BEFORE INSERT ON investigation_events FOR EACH ROW EXECUTE FUNCTION public.validate_investigation_event();
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['investigation_cases','investigation_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (gym_id = NULLIF(current_setting(''app.current_gym_id'', true), '''')::uuid) WITH CHECK (gym_id = NULLIF(current_setting(''app.current_gym_id'', true), '''')::uuid)', t || '_scope', t);
    EXECUTE format('CREATE TRIGGER immutable_record BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.reject_financial_history_mutation()', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT ON investigation_cases, investigation_events TO gym_runtime;
COMMIT;
