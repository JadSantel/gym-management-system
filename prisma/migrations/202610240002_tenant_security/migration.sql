ALTER TABLE gym_operators RENAME COLUMN "gymId" TO gym_id;
ALTER TABLE identity_invitations RENAME COLUMN "gymId" TO gym_id;
ALTER TABLE identity_audit RENAME COLUMN "gymId" TO gym_id;
ALTER TABLE gym_operators ADD COLUMN "canManageMembers" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canCollectCash" BOOLEAN NOT NULL DEFAULT false;

-- Runtime cannot provision gyms. Only the private migration-credential fixture may do so.
REVOKE INSERT ON gyms FROM gym_runtime;
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE gyms FORCE ROW LEVEL SECURITY;
CREATE POLICY gym_scope ON gyms USING (id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid);

ALTER TABLE gym_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_operators FORCE ROW LEVEL SECURITY;
CREATE POLICY operator_scope ON gym_operators USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid);

ALTER TABLE identity_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitation_scope ON identity_invitations USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid);

ALTER TABLE identity_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_scope ON identity_audit USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid);

-- Narrow authentication exception: one binding by provider-verified user ID, no business records or mutation.
-- Owned by migrator, deliberately privileged to read across forced RLS. Fixed search path and qualified objects.
CREATE FUNCTION public.identity_binding(p_user_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('id', o.id, 'userId', o."userId", 'gymId', o.gym_id,
    'role', o.role, 'state', o.state, 'canManageMembers', o."canManageMembers", 'canCollectCash', o."canCollectCash",
    'gym', jsonb_build_object('id', g.id, 'name', g.name, 'state', g.state),
    'user', jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'emailVerified', u."emailVerified", 'username', u.username))
  FROM public.gym_operators o JOIN public.gyms g ON g.id=o.gym_id JOIN public.auth_users u ON u.id=o."userId"
  WHERE o."userId"=p_user_id
$$;
REVOKE ALL ON FUNCTION public.identity_binding(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.identity_binding(text) TO gym_runtime;

-- Before a tenant can be resolved, reveal only the scope of a presented 256-bit link hash.
CREATE FUNCTION public.setup_scope(p_hash text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT gym_id FROM public.identity_invitations
  WHERE "tokenHash"=p_hash AND "consumedAt" IS NULL AND "sentAt" IS NOT NULL AND "expiresAt">CURRENT_TIMESTAMP
$$;
REVOKE ALL ON FUNCTION public.setup_scope(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_scope(text) TO gym_runtime;
