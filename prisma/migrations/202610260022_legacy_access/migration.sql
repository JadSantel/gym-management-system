BEGIN;
CREATE TABLE legacy_records (
 id uuid PRIMARY KEY, gym_id uuid NOT NULL REFERENCES gyms(id), member_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('PREPARE','APPROVE','FLAG','REJECT')),
 proposal_id uuid, previous_id uuid,
 source_reference text NOT NULL CHECK(length(source_reference) BETWEEN 1 AND 100),
 source_type text NOT NULL CHECK(source_type IN ('GYM_REGISTER','ACCESS_CARD','ACCESS_AGREEMENT')),
 corroborating_reference text CHECK(length(corroborating_reference) BETWEEN 1 AND 100),
 interpretation text NOT NULL CHECK(interpretation IN ('INSTANTS','VALID_THROUGH_DATES')),
 claimed_start text, claimed_end text, starts_at timestamptz(3), ends_at timestamptz(3),
 uncertainty text NOT NULL CHECK(uncertainty IN ('CERTAIN','CONFLICTING_EXPIRY','UNSUPPORTED_PAYMENT','UNPAID_BALANCE','AMBIGUOUS_INTERVAL')),
 notes text NOT NULL CHECK(length(notes) BETWEEN 1 AND 500), actor_id uuid NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 operation_key uuid NOT NULL, fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 UNIQUE(id,gym_id), UNIQUE(gym_id,operation_key),
 FOREIGN KEY(member_id,gym_id) REFERENCES members(id,gym_id),
 FOREIGN KEY(actor_id,gym_id) REFERENCES gym_operators(id,gym_id),
 FOREIGN KEY(proposal_id,gym_id) REFERENCES legacy_records(id,gym_id),
 FOREIGN KEY(previous_id,gym_id) REFERENCES legacy_records(id,gym_id),
 CHECK((kind='PREPARE') = (proposal_id IS NULL)),
 CHECK((starts_at IS NULL AND ends_at IS NULL) OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND starts_at < ends_at)),
 CHECK(kind <> 'APPROVE' OR (uncertainty='CERTAIN' AND starts_at IS NOT NULL AND ends_at IS NOT NULL
   AND corroborating_reference IS NOT NULL AND source_reference <> corroborating_reference))
);
CREATE UNIQUE INDEX legacy_one_decision ON legacy_records(proposal_id) WHERE kind <> 'PREPARE';
CREATE UNIQUE INDEX legacy_one_source ON legacy_records(gym_id,source_reference) WHERE kind='APPROVE';
ALTER TABLE legacy_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_records FORCE ROW LEVEL SECURITY;
CREATE POLICY legacy_scope ON legacy_records
 USING(gym_id=NULLIF(current_setting('app.current_gym_id',true),'')::uuid)
 WITH CHECK(gym_id=NULLIF(current_setting('app.current_gym_id',true),'')::uuid);
GRANT SELECT,INSERT ON legacy_records TO gym_runtime;
CREATE TRIGGER immutable_legacy BEFORE UPDATE OR DELETE ON legacy_records
 FOR EACH ROW EXECUTE FUNCTION public.reject_financial_history_mutation();

CREATE FUNCTION public.validate_legacy_record() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p public.legacy_records;
BEGIN
 IF NEW.previous_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.legacy_records
   WHERE id=NEW.previous_id AND gym_id=NEW.gym_id AND member_id=NEW.member_id) THEN
   RAISE EXCEPTION 'Previous legacy evidence must belong to this member';
 END IF;
 IF NEW.kind <> 'PREPARE' THEN
   SELECT * INTO p FROM public.legacy_records WHERE id=NEW.proposal_id AND gym_id=NEW.gym_id AND kind='PREPARE';
   IF p.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.gym_operators WHERE id=NEW.actor_id AND gym_id=NEW.gym_id AND role='OWNER' AND state='ACTIVE')
     OR ROW(NEW.member_id,NEW.source_reference,NEW.source_type,NEW.corroborating_reference,NEW.interpretation,NEW.claimed_start,NEW.claimed_end,NEW.starts_at,NEW.ends_at,NEW.uncertainty)
       IS DISTINCT FROM ROW(p.member_id,p.source_reference,p.source_type,p.corroborating_reference,p.interpretation,p.claimed_start,p.claimed_end,p.starts_at,p.ends_at,p.uncertainty) THEN
     RAISE EXCEPTION 'Owner decision must preserve exact proposed evidence';
   END IF;
   IF NEW.kind='APPROVE' AND (p.starts_at > p.created_at OR p.created_at > NEW.created_at) THEN
     RAISE EXCEPTION 'Legacy access cannot start in the future or precede entry';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_legacy BEFORE INSERT ON legacy_records FOR EACH ROW EXECUTE FUNCTION public.validate_legacy_record();

ALTER TABLE effective_entitlement_intervals ALTER COLUMN period_id DROP NOT NULL;
ALTER TABLE effective_entitlement_intervals ADD COLUMN legacy_record_id uuid UNIQUE,
 ADD FOREIGN KEY(legacy_record_id,gym_id) REFERENCES legacy_records(id,gym_id),
 ADD CHECK((period_id IS NOT NULL)::integer + (legacy_record_id IS NOT NULL)::integer = 1);
CREATE OR REPLACE FUNCTION public.validate_entitlement_period() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE source_member uuid; source_start timestamptz; source_end timestamptz;
BEGIN
 IF NEW.period_id IS NOT NULL AND NEW.legacy_record_id IS NULL THEN
   SELECT member_id,starts_at,ends_at INTO source_member,source_start,source_end
    FROM public.membership_periods WHERE id=NEW.period_id AND gym_id=NEW.gym_id;
 ELSIF NEW.legacy_record_id IS NOT NULL AND NEW.period_id IS NULL THEN
   SELECT member_id,starts_at,ends_at INTO source_member,source_start,source_end
    FROM public.legacy_records WHERE id=NEW.legacy_record_id AND gym_id=NEW.gym_id AND kind='APPROVE';
 ELSE RAISE EXCEPTION 'Exactly one entitlement source is required'; END IF;
 IF source_member IS NULL OR NEW.member_id <> source_member OR NEW.starts_at <> source_start OR NEW.ends_at <> source_end THEN
   RAISE EXCEPTION 'Entitlement must match its immutable approved source';
 END IF;
 RETURN NEW;
END $$;
-- A committed approval must have its projection. Deferred until the atomic write finishes.
CREATE FUNCTION public.require_legacy_projection() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.kind='APPROVE' AND NOT EXISTS(SELECT 1 FROM public.effective_entitlement_intervals WHERE legacy_record_id=NEW.id AND gym_id=NEW.gym_id) THEN
   RAISE EXCEPTION 'Legacy approval requires its atomic access projection';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER require_legacy_projection AFTER INSERT ON legacy_records
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.require_legacy_projection();
COMMIT;
