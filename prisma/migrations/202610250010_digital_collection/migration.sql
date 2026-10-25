BEGIN;
ALTER TABLE payments DROP CONSTRAINT payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('CASH', 'GCASH', 'BANK'));
ALTER TABLE idempotency_operations DROP CONSTRAINT idempotency_operations_operation_type_check;
ALTER TABLE idempotency_operations ADD CONSTRAINT idempotency_operations_operation_type_check
  CHECK (operation_type IN ('CASH_CONFIRMATION', 'DIGITAL_CONFIRMATION'));

CREATE TABLE receiving_accounts (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  method text NOT NULL CHECK (method IN ('GCASH', 'BANK')),
  created_by uuid NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id, gym_id), UNIQUE(gym_id, label),
  FOREIGN KEY(created_by, gym_id) REFERENCES gym_operators(id, gym_id)
);
CREATE TABLE digital_verifiers (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id),
  account_id uuid NOT NULL, operator_id uuid NOT NULL, active boolean NOT NULL DEFAULT true,
  UNIQUE(account_id, operator_id),
  FOREIGN KEY(account_id, gym_id) REFERENCES receiving_accounts(id, gym_id),
  FOREIGN KEY(operator_id, gym_id) REFERENCES gym_operators(id, gym_id)
);
CREATE TABLE digital_claims (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id),
  charge_id uuid NOT NULL UNIQUE, account_id uuid NOT NULL,
  amount_centavos integer NOT NULL CHECK (amount_centavos > 0),
  transaction_reference text NOT NULL CHECK (length(transaction_reference) BETWEEN 1 AND 100),
  reported_received_at timestamptz(3) NOT NULL,
  collected_by uuid NOT NULL, entered_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id, gym_id), UNIQUE(account_id, transaction_reference),
  FOREIGN KEY(charge_id, gym_id) REFERENCES charge_snapshots(id, gym_id),
  FOREIGN KEY(account_id, gym_id) REFERENCES receiving_accounts(id, gym_id),
  FOREIGN KEY(collected_by, gym_id) REFERENCES gym_operators(id, gym_id)
);
CREATE TABLE digital_settlements (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id),
  claim_id uuid NOT NULL UNIQUE, payment_id uuid NOT NULL UNIQUE,
  evidence_reference text NOT NULL CHECK (length(evidence_reference) BETWEEN 1 AND 100),
  account_matched boolean NOT NULL CHECK(account_matched),
  FOREIGN KEY(claim_id, gym_id) REFERENCES digital_claims(id, gym_id),
  FOREIGN KEY(payment_id, gym_id) REFERENCES payments(id, gym_id)
);
CREATE TABLE payment_flags (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), payment_id uuid NOT NULL,
  reason text NOT NULL CHECK(reason IN ('DISPUTED', 'REVERSED', 'MISSING')),
  reported_by uuid NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(payment_id, reason),
  FOREIGN KEY(payment_id, gym_id) REFERENCES payments(id, gym_id),
  FOREIGN KEY(reported_by, gym_id) REFERENCES gym_operators(id, gym_id)
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['receiving_accounts','digital_verifiers','digital_claims','digital_settlements','payment_flags'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (gym_id = NULLIF(current_setting(''app.current_gym_id'', true), '''')::uuid) WITH CHECK (gym_id = NULLIF(current_setting(''app.current_gym_id'', true), '''')::uuid)', t || '_scope', t);
    IF t <> 'digital_verifiers' THEN
      EXECUTE format('CREATE TRIGGER immutable_record BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.reject_financial_history_mutation()', t);
    END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT ON receiving_accounts, digital_verifiers, digital_claims, digital_settlements, payment_flags TO gym_runtime;
GRANT UPDATE(active) ON digital_verifiers TO gym_runtime;

-- Both directions are checked at commit: a digital payment cannot exist without
-- its matched evidence and all spendable/receipt records in the same transaction.
CREATE FUNCTION public.validate_digital_settlement() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE p public.payments; c public.digital_claims; a public.receiving_accounts;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = NEW.payment_id AND gym_id = NEW.gym_id;
  SELECT * INTO c FROM public.digital_claims WHERE id = NEW.claim_id AND gym_id = NEW.gym_id;
  SELECT * INTO a FROM public.receiving_accounts WHERE id = c.account_id AND gym_id = NEW.gym_id;
  IF p.id IS NULL OR c.id IS NULL OR a.id IS NULL OR p.method <> a.method
    OR p.charge_id <> c.charge_id OR p.amount_centavos <> c.amount_centavos
    OR p.collected_by <> c.collected_by OR p.entered_at <> c.entered_at
    OR p.collected_at > p.verified_at
    OR (p.collected_at AT TIME ZONE 'Asia/Manila')::date <> (p.verified_at AT TIME ZONE 'Asia/Manila')::date
    OR (c.reported_received_at AT TIME ZONE 'Asia/Manila')::date <> (p.verified_at AT TIME ZONE 'Asia/Manila')::date
    OR NOT EXISTS (SELECT 1 FROM public.digital_verifiers v JOIN public.gym_operators o ON o.id = v.operator_id AND o.gym_id = v.gym_id
      WHERE v.gym_id = NEW.gym_id AND v.account_id = a.id AND v.operator_id = p.verified_by AND v.active AND o.state = 'ACTIVE') THEN
    RAISE EXCEPTION 'Digital settlement requires designated matched funds and same-date verification' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_digital_settlement() FROM PUBLIC;
CREATE TRIGGER validate_digital_settlement BEFORE INSERT ON digital_settlements FOR EACH ROW EXECUTE FUNCTION public.validate_digital_settlement();
CREATE FUNCTION public.require_digital_result() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.method <> 'CASH' AND (NOT EXISTS (SELECT 1 FROM public.digital_settlements WHERE payment_id = NEW.id AND gym_id = NEW.gym_id)
    OR NOT EXISTS (SELECT 1 FROM public.membership_periods WHERE payment_id = NEW.id AND gym_id = NEW.gym_id)
    OR NOT EXISTS (SELECT 1 FROM public.payment_receipts WHERE payment_id = NEW.id AND gym_id = NEW.gym_id)
    OR NOT EXISTS (SELECT 1 FROM public.effective_entitlement_intervals e JOIN public.membership_periods m ON m.id = e.period_id AND m.gym_id = e.gym_id WHERE m.payment_id = NEW.id AND e.gym_id = NEW.gym_id)) THEN
    RAISE EXCEPTION 'Digital payment requires one complete matched result' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.require_digital_result() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER require_digital_result AFTER INSERT ON payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.require_digital_result();
COMMIT;
