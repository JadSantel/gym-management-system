BEGIN;
-- A paper source can fund only one payment, including distinct operation keys.
ALTER TABLE payments ADD COLUMN outage_entry_id uuid UNIQUE;
ALTER TABLE payments ADD FOREIGN KEY(outage_entry_id, gym_id) REFERENCES outage_entries(id, gym_id);

CREATE FUNCTION public.validate_outage_handover() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE b public.outage_books; previous public.outage_handovers; n integer; kind text; seen integer[] := '{}'; items jsonb;
BEGIN
  SELECT * INTO b FROM public.outage_books WHERE id=NEW.book_id AND gym_id=NEW.gym_id FOR UPDATE;
  SELECT * INTO previous FROM public.outage_handovers WHERE book_id=b.id AND gym_id=NEW.gym_id ORDER BY actual_at DESC LIMIT 1;
  IF b.id IS NULL OR NEW.actual_at < b.created_at OR NEW.from_id <> COALESCE(previous.to_id,b.custodian_id)
    OR (previous.id IS NOT NULL AND NEW.actual_at <= previous.actual_at) OR jsonb_typeof(NEW.counts) <> 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(NEW.counts)) <> 4 THEN
    RAISE EXCEPTION 'Physical handover requires chronological assigned custody' USING ERRCODE='23514';
  END IF;
  FOREACH kind IN ARRAY ARRAY['used','unused','void','missing'] LOOP
    items := NEW.counts->kind;
    IF items IS NULL OR jsonb_typeof(items) <> 'array' OR jsonb_array_length(items) > 200 THEN
      RAISE EXCEPTION 'Physical handover requires complete number counts' USING ERRCODE='23514';
    END IF;
    FOR n IN SELECT value::text::integer FROM jsonb_array_elements(items) LOOP
      IF n < b.first_number OR n > b.last_number OR n=ANY(seen) THEN
        RAISE EXCEPTION 'Every controlled number must be counted exactly once' USING ERRCODE='23514';
      END IF;
      seen := array_append(seen,n);
    END LOOP;
    IF previous.id IS NOT NULL AND kind <> 'unused' AND NOT (items @> (previous.counts->kind)) THEN
      RAISE EXCEPTION 'Used void and missing leaves cannot return to circulation' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF cardinality(seen) <> b.last_number-b.first_number+1 OR EXISTS(SELECT 1 FROM public.outage_entries e
    WHERE e.book_id=b.id AND e.gym_id=NEW.gym_id AND
      NOT (NEW.counts->(CASE WHEN e.issued_at <= NEW.actual_at THEN 'used' ELSE 'unused' END) @> to_jsonb(e.number))) THEN
    RAISE EXCEPTION 'Physical count must cover every leaf and match known issuance times' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_outage_handover BEFORE INSERT ON outage_handovers FOR EACH ROW EXECUTE FUNCTION public.validate_outage_handover();

CREATE FUNCTION public.guard_outage_custody() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE b public.outage_books; collector uuid; issuer uuid;
BEGIN
  SELECT * INTO b FROM public.outage_books WHERE id=NEW.book_id AND gym_id=NEW.gym_id FOR UPDATE;
  SELECT to_id INTO collector FROM public.outage_handovers WHERE book_id=b.id AND gym_id=NEW.gym_id AND actual_at <= NEW.collected_at ORDER BY actual_at DESC LIMIT 1;
  SELECT to_id INTO issuer FROM public.outage_handovers WHERE book_id=b.id AND gym_id=NEW.gym_id AND actual_at <= NEW.issued_at ORDER BY actual_at DESC LIMIT 1;
  IF NEW.collector_id <> COALESCE(collector,b.custodian_id) OR NEW.collector_id <> COALESCE(issuer,b.custodian_id)
    OR EXISTS(SELECT 1 FROM public.outage_handovers h WHERE h.book_id=b.id AND h.gym_id=NEW.gym_id AND
      ((h.counts->'void' @> to_jsonb(NEW.number)) OR (h.counts->'missing' @> to_jsonb(NEW.number))
        OR (h.actual_at >= NEW.issued_at AND NOT (h.counts->'used' @> to_jsonb(NEW.number))))) THEN
    RAISE EXCEPTION 'Receipt must match physical custody and number counts' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_outage_custody BEFORE INSERT ON outage_entries FOR EACH ROW EXECUTE FUNCTION public.guard_outage_custody();

CREATE FUNCTION public.require_outage_result() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.outage_entry_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.outage_confirmations WHERE entry_id=NEW.outage_entry_id AND payment_id=NEW.id AND gym_id=NEW.gym_id)
    OR NOT EXISTS(SELECT 1 FROM public.outage_events WHERE gym_id=NEW.gym_id AND kind='VERIFY' AND outcome='VERIFIED' AND actor_id=NEW.verified_by AND result->>'paymentId'=NEW.id::text)
    OR NOT EXISTS(SELECT 1 FROM public.payment_receipts WHERE payment_id=NEW.id AND gym_id=NEW.gym_id)
    OR NOT EXISTS(SELECT 1 FROM public.membership_periods m JOIN public.effective_entitlement_intervals e ON e.period_id=m.id AND e.gym_id=m.gym_id WHERE m.payment_id=NEW.id AND m.gym_id=NEW.gym_id)) THEN
    RAISE EXCEPTION 'Outage payment requires atomic independent confirmation period entitlement and receipt' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER require_outage_result AFTER INSERT ON payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.require_outage_result();
CREATE FUNCTION public.guard_outage_confirmation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE e public.outage_entries;
BEGIN
  SELECT * INTO e FROM public.outage_entries WHERE id=NEW.entry_id AND gym_id=NEW.gym_id;
  IF NOT EXISTS(SELECT 1 FROM public.payments WHERE id=NEW.payment_id AND gym_id=NEW.gym_id AND outage_entry_id=NEW.entry_id)
    OR EXISTS(SELECT 1 FROM public.outage_events x WHERE x.book_id=e.book_id AND x.gym_id=NEW.gym_id AND x.number=e.number AND
      ((x.kind='EXCEPTION' AND x.command->>'kind' NOT IN ('LOST_COPY','LATER_VISIT')) OR (x.kind='ENTER' AND x.outcome='OWNER_REVIEW')))
    OR EXISTS(SELECT 1 FROM public.outage_handovers h WHERE h.book_id=e.book_id AND h.gym_id=NEW.gym_id AND
      ((h.counts->'void' @> to_jsonb(e.number)) OR (h.counts->'missing' @> to_jsonb(e.number)))) THEN
    RAISE EXCEPTION 'Outage source or unresolved exception prevents confirmation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_outage_confirmation BEFORE INSERT ON outage_confirmations FOR EACH ROW EXECUTE FUNCTION public.guard_outage_confirmation();
REVOKE ALL ON FUNCTION public.validate_outage_handover(), public.guard_outage_custody(), public.require_outage_result(), public.guard_outage_confirmation() FROM PUBLIC;
COMMIT;
