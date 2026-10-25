BEGIN;

-- FOR UPDATE needs UPDATE on at least one column. Protect that column before granting it.
CREATE FUNCTION public.reject_member_id_update() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Member IDs are immutable' USING ERRCODE='23514';
END $$;
REVOKE ALL ON FUNCTION public.reject_member_id_update() FROM PUBLIC;
CREATE TRIGGER immutable_member_id BEFORE UPDATE OF id ON members
  FOR EACH ROW EXECUTE FUNCTION public.reject_member_id_update();

-- No table-wide UPDATE or permission to edit other member columns.
GRANT UPDATE (id) ON members TO gym_runtime;

COMMIT;
