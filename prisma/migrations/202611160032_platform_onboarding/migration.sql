BEGIN;

CREATE TYPE "PlatformAdminState" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "OnboardingRequestState" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

CREATE TABLE platform_admins (
  user_id text PRIMARY KEY REFERENCES auth_users(id) ON DELETE RESTRICT,
  state "PlatformAdminState" NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_admin_self ON platform_admins
  USING (user_id = NULLIF(current_setting('app.current_platform_admin_id', true), '') AND state = 'ACTIVE');

CREATE TABLE onboarding_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_name text NOT NULL,
  normalized_gym_name text NOT NULL,
  owner_name text NOT NULL,
  email text NOT NULL,
  normalized_email text NOT NULL,
  state "OnboardingRequestState" NOT NULL DEFAULT 'PENDING',
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  decided_at timestamptz(3),
  decided_by_user_id text REFERENCES platform_admins(user_id) ON DELETE RESTRICT,
  provisioned_gym_id uuid UNIQUE REFERENCES gyms(id) ON DELETE RESTRICT,
  CONSTRAINT onboarding_request_decision_consistent CHECK (
    (state = 'PENDING' AND decided_at IS NULL AND decided_by_user_id IS NULL AND provisioned_gym_id IS NULL)
    OR (state = 'APPROVED' AND decided_at IS NOT NULL AND decided_by_user_id IS NOT NULL AND provisioned_gym_id IS NOT NULL)
    OR (state = 'DECLINED' AND decided_at IS NOT NULL AND decided_by_user_id IS NOT NULL AND provisioned_gym_id IS NULL)
  )
);
ALTER TABLE onboarding_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY onboarding_request_submit ON onboarding_requests FOR INSERT
  WITH CHECK (state = 'PENDING' AND decided_at IS NULL AND decided_by_user_id IS NULL AND provisioned_gym_id IS NULL);
CREATE POLICY onboarding_request_admin_read ON onboarding_requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE user_id = NULLIF(current_setting('app.current_platform_admin_id', true), '') AND state = 'ACTIVE'));
CREATE POLICY onboarding_request_admin_update ON onboarding_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE user_id = NULLIF(current_setting('app.current_platform_admin_id', true), '') AND state = 'ACTIVE'))
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins WHERE user_id = NULLIF(current_setting('app.current_platform_admin_id', true), '') AND state = 'ACTIVE'));
CREATE UNIQUE INDEX onboarding_one_pending_request_per_owner_gym
  ON onboarding_requests(normalized_email, normalized_gym_name) WHERE state = 'PENDING';
CREATE INDEX onboarding_requests_state_created_at_idx ON onboarding_requests(state, created_at);

CREATE TABLE platform_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id text NOT NULL REFERENCES platform_admins(user_id) ON DELETE RESTRICT,
  onboarding_request_id uuid REFERENCES onboarding_requests(id) ON DELETE RESTRICT,
  action text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
ALTER TABLE platform_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_audit_admin_insert ON platform_audit_events FOR INSERT
  WITH CHECK (platform_admin_id = NULLIF(current_setting('app.current_platform_admin_id', true), '') AND EXISTS (
    SELECT 1 FROM platform_admins WHERE user_id = platform_admin_id AND state = 'ACTIVE'
  ));
CREATE INDEX platform_audit_events_admin_created_at_idx ON platform_audit_events(platform_admin_id, created_at);
CREATE INDEX platform_audit_events_request_created_at_idx ON platform_audit_events(onboarding_request_id, created_at);
CREATE FUNCTION public.protect_platform_audit_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Platform audit events are append only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER platform_audit_events_immutable BEFORE UPDATE OR DELETE ON platform_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_platform_audit_event();

CREATE OR REPLACE FUNCTION public.platform_admin_binding(identity_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins a JOIN public.auth_users u ON u.id = a.user_id
    WHERE a.user_id = identity_id AND a.state = 'ACTIVE' AND u."emailVerified"
  )
$$;
REVOKE ALL ON FUNCTION public.platform_admin_binding(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_admin_binding(text) TO gym_runtime;

CREATE OR REPLACE FUNCTION public.exclusive_member_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity_id text;
BEGIN
  IF TG_TABLE_NAME='member_accounts' OR TG_TABLE_NAME='platform_admins' THEN identity_id := NEW.user_id;
  ELSE identity_id := NEW."userId";
  END IF;
  PERFORM id FROM public.auth_users WHERE id=identity_id FOR UPDATE;
  IF (TG_TABLE_NAME='member_accounts' AND (EXISTS(SELECT 1 FROM public.gym_operators WHERE "userId"=identity_id)
      OR EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=identity_id)))
    OR (TG_TABLE_NAME='gym_operators' AND (EXISTS(SELECT 1 FROM public.member_accounts WHERE user_id=identity_id)
      OR EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=identity_id)))
    OR (TG_TABLE_NAME='platform_admins' AND (EXISTS(SELECT 1 FROM public.gym_operators WHERE "userId"=identity_id)
      OR EXISTS(SELECT 1 FROM public.member_accounts WHERE user_id=identity_id))) THEN
    RAISE EXCEPTION 'Identity binding unavailable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER platform_admin_identity_exclusive BEFORE INSERT OR UPDATE OF user_id ON platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.exclusive_member_identity();

GRANT SELECT ON platform_admins TO gym_runtime;
GRANT INSERT, SELECT, UPDATE ON onboarding_requests TO gym_runtime;
GRANT INSERT ON platform_audit_events TO gym_runtime;

COMMIT;
