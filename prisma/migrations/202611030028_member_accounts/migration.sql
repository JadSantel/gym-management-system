BEGIN;
CREATE TABLE member_accounts (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL, member_id uuid NOT NULL UNIQUE,
  user_id text NOT NULL UNIQUE REFERENCES auth_users(id), state "AccessState" NOT NULL DEFAULT 'PENDING',
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id,gym_id), FOREIGN KEY(member_id,gym_id) REFERENCES members(id,gym_id)
);
CREATE TABLE member_invitations (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL, account_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('SETUP','RESET')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz(3) NOT NULL, consumed_at timestamptz(3), sent_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (expires_at > created_at),
  FOREIGN KEY(account_id,gym_id) REFERENCES member_accounts(id,gym_id)
);
CREATE UNIQUE INDEX member_one_pending_invitation ON member_invitations(account_id) WHERE consumed_at IS NULL;
ALTER TABLE member_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY gym_scope ON member_accounts
  USING (gym_id=NULLIF(current_setting('app.current_gym_id',true),'')::uuid)
  WITH CHECK (gym_id=NULLIF(current_setting('app.current_gym_id',true),'')::uuid);
ALTER TABLE member_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY gym_scope ON member_invitations
  USING (gym_id=NULLIF(current_setting('app.current_gym_id',true),'')::uuid)
  WITH CHECK (gym_id=NULLIF(current_setting('app.current_gym_id',true),'')::uuid);
GRANT SELECT,INSERT ON member_accounts,member_invitations TO gym_runtime;
GRANT UPDATE(state) ON member_accounts TO gym_runtime;
GRANT UPDATE(consumed_at,sent_at) ON member_invitations TO gym_runtime;

-- Resolve only a provider-authenticated identity before a tenant context exists.
CREATE FUNCTION public.member_binding(p_user_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('id',a.id,'userId',a.user_id,'memberId',a.member_id,'gymId',a.gym_id,'state',a.state,
    'gym',jsonb_build_object('id',g.id,'name',g.name,'state',g.state),
    'user',jsonb_build_object('id',u.id,'email',u.email,'emailVerified',u."emailVerified"))
  FROM public.member_accounts a JOIN public.gyms g ON g.id=a.gym_id JOIN public.auth_users u ON u.id=a.user_id
  WHERE a.user_id=p_user_id
$$;
REVOKE ALL ON FUNCTION public.member_binding(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_binding(text) TO gym_runtime;
CREATE FUNCTION public.member_setup_scope(p_hash text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT gym_id FROM public.member_invitations WHERE token_hash=p_hash
    AND consumed_at IS NULL AND sent_at IS NOT NULL AND expires_at>CURRENT_TIMESTAMP
$$;
REVOKE ALL ON FUNCTION public.member_setup_scope(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_setup_scope(text) TO gym_runtime;

-- One provider identity cannot acquire both member and operator authority, including concurrent inserts.
CREATE FUNCTION public.exclusive_member_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity_id text;
BEGIN
  identity_id := CASE WHEN TG_TABLE_NAME='member_accounts' THEN NEW.user_id ELSE NEW."userId" END;
  PERFORM id FROM public.auth_users WHERE id=identity_id FOR UPDATE;
  IF (TG_TABLE_NAME='member_accounts' AND EXISTS(SELECT 1 FROM public.gym_operators WHERE "userId"=identity_id))
    OR (TG_TABLE_NAME='gym_operators' AND EXISTS(SELECT 1 FROM public.member_accounts WHERE user_id=identity_id)) THEN
    RAISE EXCEPTION 'Identity binding unavailable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.exclusive_member_identity() FROM PUBLIC;
CREATE TRIGGER member_identity_exclusive BEFORE INSERT OR UPDATE OF user_id ON member_accounts
  FOR EACH ROW EXECUTE FUNCTION public.exclusive_member_identity();
CREATE TRIGGER operator_identity_exclusive BEFORE INSERT OR UPDATE OF "userId" ON gym_operators
  FOR EACH ROW EXECUTE FUNCTION public.exclusive_member_identity();
COMMIT;
