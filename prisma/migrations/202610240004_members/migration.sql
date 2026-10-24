CREATE TABLE members (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), full_name text NOT NULL,
  name_key text NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by uuid NOT NULL,
  CONSTRAINT member_name_length CHECK (length(full_name) BETWEEN 1 AND 100),
  UNIQUE (id, gym_id), FOREIGN KEY (created_by, gym_id) REFERENCES gym_operators(id, gym_id)
);
CREATE INDEX members_gym_name ON members(gym_id, name_key);
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE members FORCE ROW LEVEL SECURITY;
CREATE POLICY member_scope ON members USING (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid);
GRANT SELECT, INSERT ON members TO gym_runtime;
