BEGIN;
ALTER TABLE closing_checks ADD COLUMN case_id uuid;
ALTER TABLE closing_checks ADD FOREIGN KEY(case_id,gym_id) REFERENCES investigation_cases(id,gym_id);
CREATE FUNCTION public.require_closing_source_coverage() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.source->>'day' IS DISTINCT FROM NEW.day OR jsonb_typeof(NEW.source->'rows') IS DISTINCT FROM 'array'
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.source->'rows') r WHERE NOT EXISTS(
    SELECT 1 FROM public.closing_lines l WHERE l.snapshot_id=NEW.id AND l.gym_id=NEW.gym_id
      AND l.collector_id::text=r->>'collectorId' AND l.method=r->>'method'
      AND l.recorded=(r->>'recorded')::integer AND l.excluded=(r->>'excluded')::integer AND l.refunds=(r->>'refunds')::integer))
  OR (SELECT COALESCE(sum(c.paid_from_batch),0) FROM public.closing_lines l
    JOIN public.closing_line_checks lc ON lc.line_id=l.id AND lc.gym_id=l.gym_id
    JOIN public.closing_checks c ON c.id=lc.check_id AND c.gym_id=lc.gym_id WHERE l.snapshot_id=NEW.id AND l.gym_id=NEW.gym_id AND l.method='CASH')
    > (SELECT COALESCE(sum(refunds),0) FROM public.closing_lines WHERE snapshot_id=NEW.id AND gym_id=NEW.gym_id AND method='CASH') THEN
  RAISE EXCEPTION 'Closing must cover captured source rows and evidenced refund payout portions' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER require_closing_source_coverage AFTER INSERT ON closing_snapshots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.require_closing_source_coverage();
REVOKE ALL ON FUNCTION public.require_closing_source_coverage() FROM PUBLIC;
COMMIT;
