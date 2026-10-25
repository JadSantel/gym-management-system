BEGIN;
CREATE TABLE closing_checks (
 id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), day text NOT NULL CHECK(day ~ '^\d{4}-\d{2}-\d{2}$'),
 source_hash text NOT NULL CHECK(length(source_hash)=64), collector_id uuid NOT NULL,
 method text NOT NULL CHECK(method IN ('CASH','GCASH','BANK')), account_id uuid,
 gross_actual integer NOT NULL CHECK(gross_actual >= 0), cash_held integer NOT NULL CHECK(cash_held >= 0),
 transferred integer NOT NULL CHECK(transferred >= 0), paid_from_batch integer NOT NULL CHECK(paid_from_batch >= 0),
 evidence_reference text NOT NULL CHECK(length(evidence_reference) BETWEEN 1 AND 100), notes text NOT NULL CHECK(length(notes) BETWEEN 1 AND 500),
 checked_by uuid NOT NULL, operation_key uuid NOT NULL, fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((method='CASH' AND account_id IS NULL AND gross_actual::bigint=cash_held::bigint+transferred+paid_from_batch)
   OR (method<>'CASH' AND account_id IS NOT NULL AND cash_held=0 AND transferred=0 AND paid_from_batch=0)),
 UNIQUE(id,gym_id), UNIQUE(gym_id,operation_key),
 FOREIGN KEY(collector_id,gym_id) REFERENCES gym_operators(id,gym_id),
 FOREIGN KEY(checked_by,gym_id) REFERENCES gym_operators(id,gym_id),
 FOREIGN KEY(account_id,gym_id) REFERENCES receiving_accounts(id,gym_id)
);
CREATE INDEX closing_checks_day ON closing_checks(gym_id,day);
CREATE TABLE closing_snapshots (
 id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), day text NOT NULL CHECK(day ~ '^\d{4}-\d{2}-\d{2}$'),
 revision integer NOT NULL CHECK(revision>0), previous_id uuid,
 source_hash text NOT NULL CHECK(length(source_hash)=64), source jsonb NOT NULL CHECK(jsonb_typeof(source)='object'),
 evidence_reference text NOT NULL CHECK(length(evidence_reference) BETWEEN 1 AND 100), notes text NOT NULL CHECK(length(notes) BETWEEN 1 AND 500),
 submitted_by uuid NOT NULL, operation_key uuid NOT NULL, fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((revision=1 AND previous_id IS NULL) OR (revision>1 AND previous_id IS NOT NULL)),
 UNIQUE(id,gym_id), UNIQUE(gym_id,day,revision), UNIQUE(gym_id,operation_key),
 FOREIGN KEY(previous_id,gym_id) REFERENCES closing_snapshots(id,gym_id),
 FOREIGN KEY(submitted_by,gym_id) REFERENCES gym_operators(id,gym_id)
);
CREATE TABLE closing_lines (
 id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), snapshot_id uuid NOT NULL, collector_id uuid NOT NULL,
 method text NOT NULL CHECK(method IN ('CASH','GCASH','BANK')),
 recorded integer NOT NULL CHECK(recorded>=0), excluded integer NOT NULL CHECK(excluded>=0 AND excluded<=recorded),
 refunds integer NOT NULL CHECK(refunds>=0), gross_actual integer NOT NULL CHECK(gross_actual>=0),
 difference integer NOT NULL CHECK(difference::bigint=gross_actual::bigint-recorded+excluded),
 UNIQUE(id,gym_id), UNIQUE(snapshot_id,collector_id,method),
 FOREIGN KEY(snapshot_id,gym_id) REFERENCES closing_snapshots(id,gym_id),
 FOREIGN KEY(collector_id,gym_id) REFERENCES gym_operators(id,gym_id)
);
CREATE TABLE closing_line_checks (
 id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), line_id uuid NOT NULL, check_id uuid NOT NULL,
 UNIQUE(line_id,check_id), FOREIGN KEY(line_id,gym_id) REFERENCES closing_lines(id,gym_id),
 FOREIGN KEY(check_id,gym_id) REFERENCES closing_checks(id,gym_id)
);
CREATE TABLE closing_approvals (
 id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), snapshot_id uuid NOT NULL UNIQUE, approved_by uuid NOT NULL,
 source_hash text NOT NULL CHECK(length(source_hash)=64),
 evidence_reference text NOT NULL CHECK(length(evidence_reference) BETWEEN 1 AND 100), notes text NOT NULL CHECK(length(notes) BETWEEN 1 AND 500),
 operation_key uuid NOT NULL, fingerprint text NOT NULL CHECK(length(fingerprint)=64), created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(gym_id,operation_key), FOREIGN KEY(snapshot_id,gym_id) REFERENCES closing_snapshots(id,gym_id),
 FOREIGN KEY(approved_by,gym_id) REFERENCES gym_operators(id,gym_id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['closing_checks','closing_snapshots','closing_lines','closing_line_checks','closing_approvals'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON %I USING (gym_id=NULLIF(current_setting(''app.current_gym_id'',true),'''')::uuid) WITH CHECK (gym_id=NULLIF(current_setting(''app.current_gym_id'',true),'''')::uuid)',t||'_scope',t);
  EXECUTE format('CREATE TRIGGER immutable_record BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.reject_financial_history_mutation()',t);
  EXECUTE format('GRANT SELECT, INSERT ON %I TO gym_runtime',t);
 END LOOP;
END $$;

CREATE FUNCTION public.validate_closing_check() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.gym_operators o WHERE o.id=NEW.checked_by AND o.gym_id=NEW.gym_id AND o.state='ACTIVE'
   AND ((NEW.method='CASH' AND (o.role='OWNER' OR o."canCollectCash"))
     OR (NEW.method<>'CASH' AND EXISTS(SELECT 1 FROM public.digital_verifiers v JOIN public.receiving_accounts a ON a.id=v.account_id AND a.gym_id=v.gym_id
       WHERE v.gym_id=NEW.gym_id AND v.operator_id=o.id AND v.account_id=NEW.account_id AND v.active AND a.method=NEW.method)))) THEN
  RAISE EXCEPTION 'Closing actual requires current cash or designated account authority' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_closing_check BEFORE INSERT ON closing_checks FOR EACH ROW EXECUTE FUNCTION public.validate_closing_check();

CREATE FUNCTION public.validate_closing_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE previous public.closing_snapshots;
BEGIN
 IF NEW.day::date+1 > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date THEN
  RAISE EXCEPTION 'Business day has not ended' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.gym_operators WHERE id=NEW.submitted_by AND gym_id=NEW.gym_id AND state='ACTIVE' AND (role='OWNER' OR "canCollectCash")) THEN
  RAISE EXCEPTION 'Closing submission requires current preparation authority' USING ERRCODE='23514';
 END IF;
 IF NEW.previous_id IS NOT NULL THEN
  SELECT * INTO previous FROM public.closing_snapshots WHERE id=NEW.previous_id AND gym_id=NEW.gym_id;
  IF previous.day<>NEW.day OR previous.revision+1<>NEW.revision THEN
   RAISE EXCEPTION 'Supplement must link the preceding same-day snapshot' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_closing_snapshot BEFORE INSERT ON closing_snapshots FOR EACH ROW EXECUTE FUNCTION public.validate_closing_snapshot();

CREATE FUNCTION public.validate_closing_approval() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.gym_operators WHERE id=NEW.approved_by AND gym_id=NEW.gym_id AND role='OWNER' AND state='ACTIVE')
  OR NOT EXISTS(SELECT 1 FROM public.closing_snapshots s WHERE s.id=NEW.snapshot_id AND s.gym_id=NEW.gym_id AND s.source_hash=NEW.source_hash
    AND NOT EXISTS(SELECT 1 FROM public.closing_snapshots newer WHERE newer.gym_id=s.gym_id AND newer.day=s.day AND newer.revision>s.revision)) THEN
  RAISE EXCEPTION 'Approval requires owner and latest matching snapshot' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_closing_approval BEFORE INSERT ON closing_approvals FOR EACH ROW EXECUTE FUNCTION public.validate_closing_approval();

CREATE FUNCTION public.require_closing_lines() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.closing_lines WHERE snapshot_id=NEW.id AND gym_id=NEW.gym_id)
   OR EXISTS(SELECT 1 FROM public.closing_lines l WHERE l.snapshot_id=NEW.id AND l.gym_id=NEW.gym_id AND
     (NOT EXISTS(SELECT 1 FROM public.closing_line_checks lc WHERE lc.line_id=l.id AND lc.gym_id=l.gym_id)
      OR l.gross_actual::bigint<>(SELECT COALESCE(sum(c.gross_actual),0) FROM public.closing_line_checks lc JOIN public.closing_checks c ON c.id=lc.check_id AND c.gym_id=lc.gym_id WHERE lc.line_id=l.id AND lc.gym_id=l.gym_id)
      OR EXISTS(SELECT 1 FROM public.closing_line_checks lc JOIN public.closing_checks c ON c.id=lc.check_id AND c.gym_id=lc.gym_id WHERE lc.line_id=l.id AND lc.gym_id=l.gym_id
        AND (c.day<>NEW.day OR c.source_hash<>NEW.source_hash OR c.collector_id<>l.collector_id OR c.method<>l.method))
      OR (SELECT count(*) FROM public.closing_line_checks lc JOIN public.closing_checks c ON c.id=lc.check_id AND c.gym_id=lc.gym_id WHERE lc.line_id=l.id AND lc.gym_id=l.gym_id)
        <>(SELECT count(DISTINCT COALESCE(c.account_id::text,'CASH')) FROM public.closing_line_checks lc JOIN public.closing_checks c ON c.id=lc.check_id AND c.gym_id=lc.gym_id WHERE lc.line_id=l.id AND lc.gym_id=l.gym_id))) THEN
  RAISE EXCEPTION 'Closing requires complete matched unique actual evidence and lines' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER require_closing_lines AFTER INSERT ON closing_snapshots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.require_closing_lines();
-- Child rows can be inserted only in the transaction creating their snapshot.
-- Otherwise INSERT alone could change an already submitted historical snapshot.
CREATE FUNCTION public.guard_closing_child() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE s public.closing_snapshots; r jsonb;
BEGIN
 IF TG_TABLE_NAME='closing_lines' THEN
  SELECT * INTO s FROM public.closing_snapshots WHERE id=NEW.snapshot_id AND gym_id=NEW.gym_id
    AND xmin::text=(pg_current_xact_id()::text::numeric % 4294967296)::text;
  IF s.id IS NOT NULL THEN
   SELECT value INTO r FROM jsonb_array_elements(s.source->'rows') WHERE value->>'collectorId'=NEW.collector_id::text AND value->>'method'=NEW.method;
   IF NEW.recorded<>COALESCE((r->>'recorded')::integer,0) OR NEW.excluded<>COALESCE((r->>'excluded')::integer,0) OR NEW.refunds<>COALESCE((r->>'refunds')::integer,0) THEN
    RAISE EXCEPTION 'Closing line must match its captured source' USING ERRCODE='23514';
   END IF;
  END IF;
 ELSE
  SELECT snap.* INTO s FROM public.closing_lines l JOIN public.closing_snapshots snap ON snap.id=l.snapshot_id AND snap.gym_id=l.gym_id
   WHERE l.id=NEW.line_id AND l.gym_id=NEW.gym_id AND snap.xmin::text=(pg_current_xact_id()::text::numeric % 4294967296)::text;
 END IF;
 IF s.id IS NULL THEN
  RAISE EXCEPTION 'Submitted closing children cannot be appended later' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_closing_child BEFORE INSERT ON closing_lines FOR EACH ROW EXECUTE FUNCTION public.guard_closing_child();
CREATE TRIGGER guard_closing_child BEFORE INSERT ON closing_line_checks FOR EACH ROW EXECUTE FUNCTION public.guard_closing_child();
REVOKE ALL ON FUNCTION public.guard_closing_child() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_closing_check(),public.validate_closing_snapshot(),public.validate_closing_approval(),public.require_closing_lines() FROM PUBLIC;
COMMIT;
