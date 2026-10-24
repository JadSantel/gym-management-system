CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE payments (
  id uuid PRIMARY KEY,
  gym_id uuid NOT NULL REFERENCES gyms(id),
  member_id uuid NOT NULL,
  charge_id uuid NOT NULL UNIQUE,
  reference text NOT NULL UNIQUE,
  amount_centavos integer NOT NULL CHECK (amount_centavos > 0),
  currency_code text NOT NULL DEFAULT 'PHP' CHECK (currency_code = 'PHP'),
  method text NOT NULL DEFAULT 'CASH' CHECK (method = 'CASH'),
  collected_by uuid NOT NULL,
  collected_at timestamptz(3) NOT NULL,
  entered_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_by uuid NOT NULL,
  verified_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payments_id_gym_key UNIQUE (id, gym_id),
  CONSTRAINT payments_charge_gym_key UNIQUE (charge_id, gym_id),
  FOREIGN KEY (member_id, gym_id) REFERENCES members(id, gym_id),
  FOREIGN KEY (charge_id, gym_id) REFERENCES charge_snapshots(id, gym_id),
  FOREIGN KEY (collected_by, gym_id) REFERENCES gym_operators(id, gym_id),
  FOREIGN KEY (verified_by, gym_id) REFERENCES gym_operators(id, gym_id)
);

CREATE TABLE membership_periods (
  id uuid PRIMARY KEY,
  gym_id uuid NOT NULL REFERENCES gyms(id),
  member_id uuid NOT NULL,
  payment_id uuid NOT NULL UNIQUE,
  confirmed_by uuid NOT NULL,
  starts_at timestamptz(3) NOT NULL,
  ends_at timestamptz(3) NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT membership_period_valid CHECK (starts_at < ends_at),
  CONSTRAINT membership_period_exact_duration CHECK (ends_at - starts_at IN (INTERVAL '30 days', INTERVAL '90 days', INTERVAL '180 days')),
  CONSTRAINT membership_period_id_gym_key UNIQUE (id, gym_id),
  CONSTRAINT membership_period_payment_gym_key UNIQUE (payment_id, gym_id),
  FOREIGN KEY (member_id, gym_id) REFERENCES members(id, gym_id),
  FOREIGN KEY (payment_id, gym_id) REFERENCES payments(id, gym_id),
  FOREIGN KEY (confirmed_by, gym_id) REFERENCES gym_operators(id, gym_id)
);

CREATE TABLE effective_entitlement_intervals (
  id uuid PRIMARY KEY,
  gym_id uuid NOT NULL REFERENCES gyms(id),
  member_id uuid NOT NULL,
  period_id uuid NOT NULL UNIQUE,
  starts_at timestamptz(3) NOT NULL,
  ends_at timestamptz(3) NOT NULL,
  is_current_projection boolean NOT NULL DEFAULT true,
  CONSTRAINT entitlement_period_valid CHECK (starts_at < ends_at),
  CONSTRAINT entitlement_id_gym_key UNIQUE (id, gym_id),
  CONSTRAINT entitlement_period_gym_key UNIQUE (period_id, gym_id),
  FOREIGN KEY (member_id, gym_id) REFERENCES members(id, gym_id),
  FOREIGN KEY (period_id, gym_id) REFERENCES membership_periods(id, gym_id)
);
ALTER TABLE effective_entitlement_intervals ADD CONSTRAINT effective_entitlement_no_overlap
  EXCLUDE USING gist (gym_id WITH =, member_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (is_current_projection);

CREATE TABLE idempotency_operations (
  id uuid PRIMARY KEY,
  gym_id uuid NOT NULL REFERENCES gyms(id),
  operation_type text NOT NULL CHECK (operation_type = 'CASH_CONFIRMATION'),
  operation_key text NOT NULL,
  request_fingerprint text NOT NULL,
  payment_id uuid,
  completed_at timestamptz(3),
  CONSTRAINT idempotency_scope_key UNIQUE (gym_id, operation_type, operation_key),
  CONSTRAINT idempotency_completed_together CHECK ((payment_id IS NULL) = (completed_at IS NULL))
);

CREATE TABLE payment_receipts (
  id uuid PRIMARY KEY,
  gym_id uuid NOT NULL REFERENCES gyms(id),
  payment_id uuid NOT NULL UNIQUE,
  reference text NOT NULL UNIQUE,
  issued_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payment_receipt_payment_gym_key UNIQUE (payment_id, gym_id),
  FOREIGN KEY (payment_id, gym_id) REFERENCES payments(id, gym_id)
);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['payments','membership_periods','effective_entitlement_intervals','idempotency_operations','payment_receipts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING (gym_id = NULLIF(current_setting(''app.current_gym_id'', true), '''')::uuid) WITH CHECK (gym_id = NULLIF(current_setting(''app.current_gym_id'', true), '''')::uuid)', table_name || '_scope', table_name);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON payments, membership_periods, effective_entitlement_intervals, idempotency_operations, payment_receipts TO gym_runtime;
GRANT UPDATE (payment_id, completed_at) ON idempotency_operations TO gym_runtime;

CREATE FUNCTION public.reject_financial_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Confirmed financial history is immutable' USING ERRCODE='23514';
END $$;
REVOKE ALL ON FUNCTION public.reject_financial_history_mutation() FROM PUBLIC;
CREATE TRIGGER immutable_payment BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION public.reject_financial_history_mutation();
CREATE TRIGGER immutable_paid_period BEFORE UPDATE OR DELETE ON membership_periods FOR EACH ROW EXECUTE FUNCTION public.reject_financial_history_mutation();
CREATE TRIGGER immutable_payment_receipt BEFORE UPDATE OR DELETE ON payment_receipts FOR EACH ROW EXECUTE FUNCTION public.reject_financial_history_mutation();
