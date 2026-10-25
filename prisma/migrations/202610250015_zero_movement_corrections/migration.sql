BEGIN;
CREATE OR REPLACE FUNCTION public.validate_execution_links() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE a public.investigation_events; r public.investigation_events; c public.investigation_cases;
BEGIN
  IF NEW.kind = 'RECOVER' THEN
    SELECT * INTO a FROM public.investigation_events WHERE id = NEW.approval_event_id AND gym_id = NEW.gym_id AND case_id = NEW.case_id AND kind = 'APPROVE_RECOVERY';
    SELECT * INTO c FROM public.investigation_cases WHERE id = NEW.case_id AND gym_id = NEW.gym_id AND reason = 'MISSING_PAYMENT' AND method = 'CASH';
    IF a.id IS NULL OR c.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.id = NEW.payment_id AND p.gym_id = NEW.gym_id
      AND p.member_id = c.member_id AND p.charge_id = a.recovery_charge_id AND p.collected_by = a.recovery_collector_id
      AND p.collected_at = c.original_collected_at AND p.amount_centavos = c.claimed_centavos AND p.method = 'CASH') THEN
      RAISE EXCEPTION 'Recovered payment must match approved original cash collection';
    END IF;
  ELSIF NEW.kind = 'EXECUTE_APPROVED' THEN
    SELECT * INTO r FROM public.investigation_events WHERE id = NEW.request_event_id AND gym_id = NEW.gym_id;
    IF NEW.amount_centavos IS DISTINCT FROM r.amount_centavos OR NEW.method IS DISTINCT FROM r.method
      OR NEW.access_outcome IS DISTINCT FROM r.access_outcome OR NEW.effective_at IS DISTINCT FROM r.effective_at
      OR NEW.period_id IS DISTINCT FROM r.period_id OR NEW.related_payment_id IS DISTINCT FROM r.related_payment_id
      OR r.reason NOT IN ('DUPLICATE_RECORD','TWO_COLLECTIONS','INCORRECT_ENTRY','FUNDS_ABSENT')
      OR (r.reason IN ('INCORRECT_ENTRY','FUNDS_ABSENT') AND (r.money_outcome <> 'NO_MOVEMENT' OR r.amount_centavos <> 0))
      OR (r.reason = 'TWO_COLLECTIONS' AND (r.same_obligation IS DISTINCT FROM true OR r.unintended_collection IS DISTINCT FROM true)) THEN
      RAISE EXCEPTION 'Adjustment must preserve exact supported approved proposal';
    END IF;
  ELSIF NEW.kind = 'SETTLE' THEN
    SELECT * INTO a FROM public.investigation_events WHERE id = NEW.execution_event_id AND gym_id = NEW.gym_id;
    IF NEW.amount_centavos IS DISTINCT FROM a.amount_centavos OR NEW.method IS DISTINCT FROM a.method
      OR NEW.settled_at < a.created_at OR NEW.settled_at > clock_timestamp() THEN
      RAISE EXCEPTION 'Verified settlement must match pending refund';
    END IF;
  END IF;
  RETURN NEW;
END $$;
COMMIT;
