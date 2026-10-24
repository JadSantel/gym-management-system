ALTER TABLE idempotency_operations
  ADD CONSTRAINT idempotency_payment_gym_fk FOREIGN KEY (payment_id, gym_id) REFERENCES payments(id, gym_id);


CREATE FUNCTION public.validate_confirmed_payment() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE charge_member uuid; charge_price integer;
BEGIN
  SELECT member_id, price_centavos INTO charge_member, charge_price
  FROM public.charge_snapshots WHERE id = NEW.charge_id AND gym_id = NEW.gym_id;
  IF NOT FOUND OR NEW.member_id <> charge_member OR NEW.amount_centavos <> charge_price THEN
    RAISE EXCEPTION 'Payment must match its approved charge and full amount' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_confirmed_payment() FROM PUBLIC;
CREATE TRIGGER validate_confirmed_payment BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION public.validate_confirmed_payment();

CREATE FUNCTION public.validate_paid_period() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE payment_member uuid; payment_gym uuid; verifier uuid; duration integer;
BEGIN
  SELECT p.member_id, p.gym_id, p.verified_by, c.duration_days INTO payment_member, payment_gym, verifier, duration
  FROM public.payments p JOIN public.charge_snapshots c ON c.id = p.charge_id AND c.gym_id = p.gym_id
  WHERE p.id = NEW.payment_id AND p.gym_id = NEW.gym_id;
  IF NOT FOUND OR NEW.member_id <> payment_member OR NEW.gym_id <> payment_gym OR NEW.confirmed_by <> verifier
     OR NEW.ends_at <> NEW.starts_at + duration * INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'Paid period must match its confirmed charge duration' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_paid_period() FROM PUBLIC;
CREATE TRIGGER validate_paid_period BEFORE INSERT ON membership_periods FOR EACH ROW EXECUTE FUNCTION public.validate_paid_period();

CREATE FUNCTION public.validate_entitlement_period() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE period_member uuid; period_gym uuid; period_start timestamptz; period_end timestamptz;
BEGIN
  SELECT member_id, gym_id, starts_at, ends_at INTO period_member, period_gym, period_start, period_end
  FROM public.membership_periods WHERE id = NEW.period_id AND gym_id = NEW.gym_id;
  IF NOT FOUND OR NEW.member_id <> period_member OR NEW.gym_id <> period_gym
     OR NEW.starts_at <> period_start OR NEW.ends_at <> period_end THEN
    RAISE EXCEPTION 'Entitlement must match its immutable paid period' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_entitlement_period() FROM PUBLIC;
CREATE TRIGGER validate_entitlement_period BEFORE INSERT ON effective_entitlement_intervals FOR EACH ROW EXECUTE FUNCTION public.validate_entitlement_period();
