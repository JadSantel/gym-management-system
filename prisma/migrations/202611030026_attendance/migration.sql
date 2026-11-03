CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE member_qrs (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), member_id uuid NOT NULL,
  code text NOT NULL UNIQUE CHECK(code ~ '^[A-Za-z0-9_-]{43}$'), created_by uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, revoked_at timestamptz(3),
  UNIQUE(id,gym_id), FOREIGN KEY(member_id,gym_id) REFERENCES members(id,gym_id),
  FOREIGN KEY(created_by,gym_id) REFERENCES gym_operators(id,gym_id)
);
CREATE UNIQUE INDEX member_qrs_active ON member_qrs(gym_id,member_id) WHERE revoked_at IS NULL;
CREATE TABLE attendance_visits (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), member_id uuid NOT NULL,
  arrived_at timestamptz(3) NOT NULL, departed_at timestamptz(3), day date NOT NULL,
  is_open boolean NOT NULL DEFAULT true, voided boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  UNIQUE(id,gym_id), UNIQUE(id,member_id,gym_id), FOREIGN KEY(member_id,gym_id) REFERENCES members(id,gym_id),
  CHECK(day = (arrived_at AT TIME ZONE 'Asia/Manila')::date),
  CHECK(departed_at IS NULL OR departed_at>arrived_at),
  CHECK(NOT is_open OR (departed_at IS NULL AND NOT voided)),
  EXCLUDE USING gist (gym_id WITH =, member_id WITH =,
    tstzrange(arrived_at,COALESCE(departed_at,((day+1)::timestamp AT TIME ZONE 'Asia/Manila')),'[)') WITH &&) WHERE (NOT voided)
);
CREATE UNIQUE INDEX attendance_one_open ON attendance_visits(gym_id,member_id) WHERE is_open;
CREATE INDEX attendance_visits_gym_id_arrived_at_idx ON attendance_visits(gym_id,arrived_at);
CREATE TABLE attendance_operations (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), request_id uuid NOT NULL, member_id uuid,
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'), result jsonb NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(gym_id,request_id),
  FOREIGN KEY(member_id,gym_id) REFERENCES members(id,gym_id)
);
CREATE TABLE attendance_events (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), member_id uuid NOT NULL, visit_id uuid NOT NULL,
  request_id uuid NOT NULL, actor_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('IN','OUT','CORRECT','VOID')),
  revision integer NOT NULL CHECK(revision>0), arrived_at timestamptz(3) NOT NULL, departed_at timestamptz(3), reason text,
  created_at timestamptz(3) NOT NULL, UNIQUE(visit_id,revision), UNIQUE(gym_id,request_id),
  FOREIGN KEY(visit_id,member_id,gym_id) REFERENCES attendance_visits(id,member_id,gym_id),
  FOREIGN KEY(actor_id,gym_id) REFERENCES gym_operators(id,gym_id),
  FOREIGN KEY(gym_id,request_id) REFERENCES attendance_operations(gym_id,request_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK(kind IN ('IN','OUT') OR length(btrim(reason)) BETWEEN 1 AND 500)
);
CREATE INDEX attendance_events_gym_member_time ON attendance_events(gym_id,member_id,created_at);
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['member_qrs','attendance_visits','attendance_operations','attendance_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY attendance_scope ON %I USING (gym_id = NULLIF(current_setting(''app.current_gym_id'',true),'''')::uuid) WITH CHECK (gym_id = NULLIF(current_setting(''app.current_gym_id'',true),'''')::uuid)',table_name);
    EXECUTE format('GRANT SELECT, INSERT ON %I TO gym_runtime',table_name);
  END LOOP;
END $$;
GRANT UPDATE(revoked_at) ON member_qrs TO gym_runtime;
GRANT UPDATE(arrived_at,departed_at,day,is_open,voided,revision) ON attendance_visits TO gym_runtime;
CREATE FUNCTION preserve_attendance_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Attendance evidence is immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER attendance_events_immutable BEFORE UPDATE OR DELETE ON attendance_events FOR EACH ROW EXECUTE FUNCTION preserve_attendance_evidence();
CREATE TRIGGER attendance_operations_immutable BEFORE UPDATE OR DELETE ON attendance_operations FOR EACH ROW EXECUTE FUNCTION preserve_attendance_evidence();
