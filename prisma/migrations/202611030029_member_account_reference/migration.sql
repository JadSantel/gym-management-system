BEGIN;
CREATE UNIQUE INDEX member_accounts_member_id_gym_id_key ON member_accounts(member_id,gym_id);
CREATE OR REPLACE FUNCTION public.exclusive_member_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity_id text;
BEGIN
  IF TG_TABLE_NAME='member_accounts' THEN identity_id := NEW.user_id;
  ELSE identity_id := NEW."userId";
  END IF;
  PERFORM id FROM public.auth_users WHERE id=identity_id FOR UPDATE;
  IF (TG_TABLE_NAME='member_accounts' AND EXISTS(SELECT 1 FROM public.gym_operators WHERE "userId"=identity_id))
    OR (TG_TABLE_NAME='gym_operators' AND EXISTS(SELECT 1 FROM public.member_accounts WHERE user_id=identity_id)) THEN
    RAISE EXCEPTION 'Identity binding unavailable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
COMMIT;
