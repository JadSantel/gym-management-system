BEGIN;

CREATE FUNCTION public.create_platform_pending_gym(gym_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  admin_id text := NULLIF(current_setting('app.current_platform_admin_id', true), '');
  gym_id uuid := gen_random_uuid();
BEGIN
  IF admin_id IS NULL OR NOT public.platform_admin_binding(admin_id) THEN
    RAISE EXCEPTION 'Platform approval required' USING ERRCODE='42501';
  END IF;
  IF length(btrim(gym_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid gym name' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.gyms(id, name, state) VALUES (gym_id, btrim(gym_name), 'PENDING');
  RETURN gym_id;
END $$;
REVOKE ALL ON FUNCTION public.create_platform_pending_gym(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_platform_pending_gym(text) TO gym_runtime;

COMMIT;
