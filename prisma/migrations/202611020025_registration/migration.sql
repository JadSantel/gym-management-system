-- Additive: retain existing members, operator attribution and financial history.
ALTER TABLE members ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE members ADD COLUMN email text, ADD COLUMN phone text, ADD COLUMN source text NOT NULL DEFAULT 'STAFF';
ALTER TABLE members ADD CONSTRAINT member_source CHECK (
  (source = 'STAFF' AND created_by IS NOT NULL) OR (source = 'PUBLIC_REGISTRATION' AND created_by IS NULL));
ALTER TABLE members ADD CONSTRAINT member_email CHECK (email IS NULL OR (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254));
ALTER TABLE members ADD CONSTRAINT member_phone CHECK (phone IS NULL OR phone ~ '^\+639[0-9]{9}$');
CREATE UNIQUE INDEX members_gym_id_email_key ON members(gym_id, email);
CREATE UNIQUE INDEX members_gym_id_phone_key ON members(gym_id, phone);
GRANT UPDATE (email, phone) ON members TO gym_runtime;
CREATE TABLE registration_links (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), code text NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz(3) NOT NULL, revoked_at timestamptz(3), created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by uuid NOT NULL, UNIQUE(id, gym_id), FOREIGN KEY(created_by, gym_id) REFERENCES gym_operators(id, gym_id)
);
CREATE UNIQUE INDEX registration_links_one_active ON registration_links(gym_id) WHERE revoked_at IS NULL;
CREATE TABLE registration_attempts (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), link_id uuid NOT NULL, request_id uuid NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'), outcome text NOT NULL CHECK (outcome IN ('PENDING', 'RECEPTION')),
  member_id uuid, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(link_id, request_id), FOREIGN KEY(link_id, gym_id) REFERENCES registration_links(id, gym_id),
  FOREIGN KEY(member_id, gym_id) REFERENCES members(id, gym_id),
  CHECK ((outcome = 'PENDING' AND member_id IS NOT NULL) OR (outcome = 'RECEPTION' AND member_id IS NULL))
);
ALTER TABLE registration_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_links FORCE ROW LEVEL SECURITY;
CREATE POLICY registration_link_scope ON registration_links USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid);
ALTER TABLE registration_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY registration_attempt_scope ON registration_attempts USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid);
GRANT SELECT, INSERT ON registration_links, registration_attempts TO gym_runtime;
GRANT UPDATE (revoked_at) ON registration_links TO gym_runtime;
-- Narrow pre-tenant exception; no member data, operator identities or writes.
CREATE FUNCTION public.registration_scope(p_code text) RETURNS TABLE (id uuid, gym_id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT l.id, l.gym_id, g.name FROM public.registration_links l JOIN public.gyms g ON g.id=l.gym_id
  WHERE l.code=p_code AND l.revoked_at IS NULL AND l.expires_at>CURRENT_TIMESTAMP AND g.state='ACTIVE'
$$;
REVOKE ALL ON FUNCTION public.registration_scope(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_scope(text) TO gym_runtime;
