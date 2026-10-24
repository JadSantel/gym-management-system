CREATE TABLE plans (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), name text NOT NULL,
  duration_days integer NOT NULL, price_centavos integer NOT NULL CHECK (price_centavos > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by uuid NOT NULL,
  CONSTRAINT plans_approved_definition CHECK (
    (name='Monthly' AND duration_days=30) OR (name='3 Months' AND duration_days=90) OR (name='6 Months' AND duration_days=180)
  ),
  CONSTRAINT plans_id_gym_key UNIQUE (id, gym_id),
  CONSTRAINT plans_gym_duration_key UNIQUE (gym_id, duration_days),
  FOREIGN KEY (created_by, gym_id) REFERENCES gym_operators(id, gym_id)
);
CREATE TABLE charge_snapshots (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), member_id uuid NOT NULL,
  plan_id uuid NOT NULL, plan_name text NOT NULL, duration_days integer NOT NULL,
  price_centavos integer NOT NULL CHECK (price_centavos > 0), plan_version integer NOT NULL CHECK (plan_version > 0),
  prepared_by uuid NOT NULL, prepared_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  intended_start timestamptz(3) NOT NULL, intended_end timestamptz(3) NOT NULL,
  CONSTRAINT charge_approved_definition CHECK (
    (plan_name='Monthly' AND duration_days=30) OR (plan_name='3 Months' AND duration_days=90) OR (plan_name='6 Months' AND duration_days=180)
  ),
  CONSTRAINT charge_exact_duration CHECK (intended_end = intended_start + duration_days * INTERVAL '24 hours'),
  CONSTRAINT charges_id_gym_key UNIQUE (id, gym_id),
  FOREIGN KEY (member_id, gym_id) REFERENCES members(id, gym_id),
  FOREIGN KEY (plan_id, gym_id) REFERENCES plans(id, gym_id),
  FOREIGN KEY (prepared_by, gym_id) REFERENCES gym_operators(id, gym_id)
);
CREATE INDEX charges_gym_member_idx ON charge_snapshots(gym_id, member_id);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans FORCE ROW LEVEL SECURITY;
CREATE POLICY plans_scope ON plans USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid);
ALTER TABLE charge_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY charge_scope ON charge_snapshots USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid);
GRANT SELECT, INSERT ON plans, charge_snapshots TO gym_runtime;
GRANT UPDATE (price_centavos, version) ON plans TO gym_runtime;

-- Charge terms survive catalogue changes and cannot be silently rewritten, even by a direct administrative query.
CREATE FUNCTION public.preserve_charge_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Charge snapshots are immutable' USING ERRCODE='23514';
END $$;
REVOKE ALL ON FUNCTION public.preserve_charge_snapshot() FROM PUBLIC;
CREATE TRIGGER immutable_charge_snapshot BEFORE UPDATE OR DELETE ON charge_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.preserve_charge_snapshot();
