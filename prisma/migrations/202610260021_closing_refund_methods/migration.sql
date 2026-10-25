BEGIN;
-- Net reporting follows original collection attribution; physical cash evidence follows
-- actual refund payout method. A bank collection can be refunded in evidenced cash.
CREATE OR REPLACE FUNCTION public.require_closing_source_coverage() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.source->>'day' IS DISTINCT FROM NEW.day OR jsonb_typeof(NEW.source->'rows') IS DISTINCT FROM 'array'
  OR jsonb_typeof(NEW.source->'refundMovements') IS DISTINCT FROM 'array'
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.source->'rows') r WHERE NOT EXISTS(
    SELECT 1 FROM public.closing_lines l WHERE l.snapshot_id=NEW.id AND l.gym_id=NEW.gym_id
      AND l.collector_id::text=r->>'collectorId' AND l.method=r->>'method'
      AND l.recorded=(r->>'recorded')::integer AND l.excluded=(r->>'excluded')::integer AND l.refunds=(r->>'refunds')::integer))
  OR (SELECT COALESCE(sum(c.paid_from_batch),0) FROM public.closing_lines l
    JOIN public.closing_line_checks lc ON lc.line_id=l.id AND lc.gym_id=l.gym_id
    JOIN public.closing_checks c ON c.id=lc.check_id AND c.gym_id=lc.gym_id WHERE l.snapshot_id=NEW.id AND l.gym_id=NEW.gym_id AND l.method='CASH')
    > (SELECT COALESCE(sum((r->>'amountCentavos')::bigint),0) FROM jsonb_array_elements(NEW.source->'refundMovements') r WHERE r->>'actualMethod'='CASH') THEN
  RAISE EXCEPTION 'Closing must cover captured source rows and evidenced refund payout portions' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
COMMIT;
