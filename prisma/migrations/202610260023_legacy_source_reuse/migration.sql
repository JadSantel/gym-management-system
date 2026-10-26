BEGIN;
-- Each identifier denotes one specific historical item, including corroboration.
-- Swapping primary/corroborating references must not grant a second membership.
CREATE FUNCTION public.guard_legacy_source_reuse() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.kind='APPROVE' THEN
   PERFORM id FROM public.gyms WHERE id=NEW.gym_id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM public.legacy_records WHERE gym_id=NEW.gym_id AND kind='APPROVE'
     AND (source_reference IN (NEW.source_reference,NEW.corroborating_reference)
       OR corroborating_reference IN (NEW.source_reference,NEW.corroborating_reference))) THEN
     RAISE EXCEPTION 'Historical source item already supports approved access' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_legacy_source_reuse BEFORE INSERT ON legacy_records
 FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_source_reuse();
COMMIT;
