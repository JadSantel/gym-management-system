CREATE FUNCTION public.protect_idempotency_result() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.payment_id IS NOT NULL OR OLD.completed_at IS NOT NULL
     OR NEW.id IS DISTINCT FROM OLD.id OR NEW.gym_id IS DISTINCT FROM OLD.gym_id
     OR NEW.operation_type IS DISTINCT FROM OLD.operation_type OR NEW.operation_key IS DISTINCT FROM OLD.operation_key
     OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
     OR NEW.payment_id IS NULL OR NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'Committed idempotency results are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_idempotency_result() FROM PUBLIC;
CREATE TRIGGER immutable_idempotency_result BEFORE UPDATE OR DELETE ON idempotency_operations FOR EACH ROW EXECUTE FUNCTION public.protect_idempotency_result();
