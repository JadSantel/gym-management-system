BEGIN;
CREATE TABLE outage_books (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), code text NOT NULL CHECK(code ~ '^[A-Z][A-Z0-9]{1,15}$'),
  first_number integer NOT NULL CHECK(first_number > 0), last_number integer NOT NULL CHECK(last_number <= 999999999),
  custodian_id uuid NOT NULL, created_by uuid NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(last_number >= first_number AND last_number - first_number < 200), UNIQUE(gym_id, code), UNIQUE(id, gym_id),
  FOREIGN KEY(custodian_id, gym_id) REFERENCES gym_operators(id, gym_id), FOREIGN KEY(created_by, gym_id) REFERENCES gym_operators(id, gym_id)
);
CREATE TABLE outage_prices (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), book_id uuid NOT NULL, plan_id uuid NOT NULL,
  plan_name text NOT NULL, duration_days integer NOT NULL CHECK(duration_days IN (30,90,180)),
  price_centavos integer NOT NULL CHECK(price_centavos > 0), plan_version integer NOT NULL CHECK(plan_version > 0),
  UNIQUE(book_id, plan_id), UNIQUE(id, gym_id), FOREIGN KEY(book_id, gym_id) REFERENCES outage_books(id, gym_id),
  FOREIGN KEY(plan_id, gym_id) REFERENCES plans(id, gym_id)
);
CREATE TABLE outage_verifiers (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), operator_id uuid NOT NULL, active boolean NOT NULL,
  UNIQUE(gym_id, operator_id), FOREIGN KEY(operator_id, gym_id) REFERENCES gym_operators(id, gym_id)
);
CREATE TABLE outage_entries (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), book_id uuid NOT NULL, number integer NOT NULL,
  member_id uuid NOT NULL, price_id uuid NOT NULL, amount_centavos integer NOT NULL CHECK(amount_centavos > 0),
  collector_id uuid NOT NULL, collected_at timestamptz(3) NOT NULL, issued_at timestamptz(3) NOT NULL,
  receipt_reference text NOT NULL, cash_reference text NOT NULL, entered_by uuid NOT NULL, entered_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  visit_at timestamptz(3), visit_authorizer_id uuid, visit_reference text,
  CHECK(collected_at <= issued_at AND issued_at <= entered_at),
  CHECK((visit_at IS NULL AND visit_authorizer_id IS NULL AND visit_reference IS NULL) OR
    (visit_at IS NOT NULL AND visit_authorizer_id IS NOT NULL AND visit_reference IS NOT NULL AND visit_at >= issued_at AND visit_at <= entered_at)),
  UNIQUE(book_id, number), UNIQUE(id, gym_id), UNIQUE(gym_id, receipt_reference), UNIQUE(gym_id, cash_reference),
  FOREIGN KEY(book_id, gym_id) REFERENCES outage_books(id, gym_id), FOREIGN KEY(member_id, gym_id) REFERENCES members(id, gym_id),
  FOREIGN KEY(price_id, gym_id) REFERENCES outage_prices(id, gym_id), FOREIGN KEY(collector_id, gym_id) REFERENCES gym_operators(id, gym_id),
  FOREIGN KEY(entered_by, gym_id) REFERENCES gym_operators(id, gym_id), FOREIGN KEY(visit_authorizer_id, gym_id) REFERENCES gym_operators(id, gym_id)
);
CREATE TABLE outage_handovers (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), book_id uuid NOT NULL, from_id uuid NOT NULL, to_id uuid NOT NULL,
  actual_at timestamptz(3) NOT NULL, entered_by uuid NOT NULL, entered_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  counts jsonb NOT NULL, cash_held integer NOT NULL CHECK(cash_held >= 0), cash_transferred integer NOT NULL CHECK(cash_transferred >= 0),
  transfer_reference text NOT NULL, evidence_reference text NOT NULL, outstanding text NOT NULL,
  CHECK(actual_at <= entered_at), UNIQUE(book_id, actual_at), UNIQUE(id, gym_id),
  FOREIGN KEY(book_id, gym_id) REFERENCES outage_books(id, gym_id), FOREIGN KEY(from_id, gym_id) REFERENCES gym_operators(id, gym_id),
  FOREIGN KEY(to_id, gym_id) REFERENCES gym_operators(id, gym_id), FOREIGN KEY(entered_by, gym_id) REFERENCES gym_operators(id, gym_id)
);
CREATE TABLE outage_confirmations (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), entry_id uuid NOT NULL UNIQUE, payment_id uuid NOT NULL UNIQUE,
  handover_id uuid NOT NULL, receipt_evidence text NOT NULL, cash_evidence text NOT NULL, custody_evidence text NOT NULL,
  CHECK(receipt_evidence <> cash_evidence AND receipt_evidence <> custody_evidence AND cash_evidence <> custody_evidence),
  FOREIGN KEY(entry_id, gym_id) REFERENCES outage_entries(id, gym_id), FOREIGN KEY(payment_id, gym_id) REFERENCES payments(id, gym_id),
  FOREIGN KEY(handover_id, gym_id) REFERENCES outage_handovers(id, gym_id)
);
CREATE TABLE outage_events (
  id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), book_id uuid, number integer, member_id uuid, case_id uuid,
  kind text NOT NULL CHECK(kind IN ('REGISTER','VERIFIER','ENTER','HANDOVER','EXCEPTION','VERIFY')),
  outcome text NOT NULL, operation_key uuid NOT NULL, fingerprint text NOT NULL CHECK(length(fingerprint)=64),
  command jsonb NOT NULL, result jsonb NOT NULL, actor_id uuid NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(gym_id, operation_key), FOREIGN KEY(book_id, gym_id) REFERENCES outage_books(id, gym_id),
  FOREIGN KEY(member_id, gym_id) REFERENCES members(id, gym_id), FOREIGN KEY(case_id, gym_id) REFERENCES investigation_cases(id, gym_id),
  FOREIGN KEY(actor_id, gym_id) REFERENCES gym_operators(id, gym_id)
);
CREATE INDEX outage_events_book_idx ON outage_events(gym_id, book_id, created_at);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['outage_books','outage_prices','outage_verifiers','outage_entries','outage_handovers','outage_confirmations','outage_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (gym_id = NULLIF(current_setting(''app.current_gym_id'', true), '''')::uuid) WITH CHECK (gym_id = NULLIF(current_setting(''app.current_gym_id'', true), '''')::uuid)', t || '_scope', t);
    IF t <> 'outage_verifiers' THEN
      EXECUTE format('CREATE TRIGGER immutable_record BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.reject_financial_history_mutation()', t);
    END IF;
    EXECUTE format('GRANT SELECT, INSERT ON %I TO gym_runtime', t);
  END LOOP;
END $$;
GRANT UPDATE(active) ON outage_verifiers TO gym_runtime;
-- SELECT FOR UPDATE requires UPDATE on one column; immutable trigger forbids actual changes.
GRANT UPDATE(id) ON outage_books TO gym_runtime;

CREATE FUNCTION public.validate_outage_entry() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE b public.outage_books; s public.outage_prices;
BEGIN
  SELECT * INTO b FROM public.outage_books WHERE id=NEW.book_id AND gym_id=NEW.gym_id;
  SELECT * INTO s FROM public.outage_prices WHERE id=NEW.price_id AND gym_id=NEW.gym_id;
  IF b.id IS NULL OR s.id IS NULL OR s.book_id <> b.id OR NEW.number NOT BETWEEN b.first_number AND b.last_number
    OR NEW.amount_centavos <> s.price_centavos OR NEW.collected_at < b.created_at THEN
    RAISE EXCEPTION 'Outage entry requires a controlled number and full historical snapshot' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_outage_entry BEFORE INSERT ON outage_entries FOR EACH ROW EXECUTE FUNCTION public.validate_outage_entry();
CREATE FUNCTION public.validate_outage_confirmation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE e public.outage_entries; p public.payments; s public.outage_prices; h public.outage_handovers; c public.charge_snapshots;
BEGIN
  SELECT * INTO e FROM public.outage_entries WHERE id=NEW.entry_id AND gym_id=NEW.gym_id;
  SELECT * INTO p FROM public.payments WHERE id=NEW.payment_id AND gym_id=NEW.gym_id;
  SELECT * INTO s FROM public.outage_prices WHERE id=e.price_id AND gym_id=NEW.gym_id;
  SELECT * INTO h FROM public.outage_handovers WHERE id=NEW.handover_id AND gym_id=NEW.gym_id;
  SELECT * INTO c FROM public.charge_snapshots WHERE id=p.charge_id AND gym_id=NEW.gym_id;
  IF e.id IS NULL OR p.id IS NULL OR h.id IS NULL OR c.id IS NULL OR p.method <> 'CASH' OR p.member_id <> e.member_id
    OR p.collected_by <> e.collector_id OR p.collected_at <> e.collected_at OR p.entered_at <> e.entered_at OR p.verified_at < e.entered_at
    OR p.verified_by IN (e.collector_id, e.entered_by) OR p.amount_centavos <> e.amount_centavos
    OR c.plan_id <> s.plan_id OR c.price_centavos <> s.price_centavos OR c.duration_days <> s.duration_days OR c.plan_version <> s.plan_version
    OR h.book_id <> e.book_id OR h.from_id <> e.collector_id OR h.actual_at < e.issued_at
    OR NOT (h.counts->'used' @> to_jsonb(e.number))
    OR NOT EXISTS(SELECT 1 FROM public.outage_verifiers v JOIN public.gym_operators o ON o.id=v.operator_id AND o.gym_id=v.gym_id
      WHERE v.gym_id=NEW.gym_id AND v.operator_id=p.verified_by AND v.active AND o.state='ACTIVE') THEN
    RAISE EXCEPTION 'Outage verification requires independent authority and matched receipt cash custody' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_outage_confirmation BEFORE INSERT ON outage_confirmations FOR EACH ROW EXECUTE FUNCTION public.validate_outage_confirmation();
REVOKE ALL ON FUNCTION public.validate_outage_entry(), public.validate_outage_confirmation() FROM PUBLIC;
COMMIT;
