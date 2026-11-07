BEGIN;
-- User-approved collector verification for the bounded enrollment providers.
CREATE OR REPLACE FUNCTION public.validate_digital_settlement() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE p public.payments; c public.digital_claims; a public.receiving_accounts;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = NEW.payment_id AND gym_id = NEW.gym_id;
  SELECT * INTO c FROM public.digital_claims WHERE id = NEW.claim_id AND gym_id = NEW.gym_id;
  SELECT * INTO a FROM public.receiving_accounts WHERE id = c.account_id AND gym_id = NEW.gym_id;
  IF p.id IS NULL OR c.id IS NULL OR a.id IS NULL OR p.method <> a.method
    OR p.charge_id <> c.charge_id OR p.amount_centavos <> c.amount_centavos
    OR p.collected_by <> c.collected_by OR p.entered_at <> c.entered_at
    OR p.collected_at > p.verified_at
    OR (p.collected_at AT TIME ZONE 'Asia/Manila')::date <> (p.verified_at AT TIME ZONE 'Asia/Manila')::date
    OR (c.reported_received_at AT TIME ZONE 'Asia/Manila')::date <> (p.verified_at AT TIME ZONE 'Asia/Manila')::date
    OR NOT (EXISTS (SELECT 1 FROM public.gym_operators o WHERE o.id = p.verified_by AND o.gym_id = NEW.gym_id AND o.state = 'ACTIVE' AND (o.role = 'OWNER' OR o."canCollectCash") AND p.verified_by = p.collected_by AND a.label IN ('Enrollment: GCash', 'Enrollment: GoTyme', 'Enrollment: MariBank')) OR EXISTS (SELECT 1 FROM public.digital_verifiers v JOIN public.gym_operators o ON o.id = v.operator_id AND o.gym_id = v.gym_id
      WHERE v.gym_id = NEW.gym_id AND v.account_id = a.id AND v.operator_id = p.verified_by AND v.active AND o.state = 'ACTIVE')) THEN
    RAISE EXCEPTION 'Digital settlement requires designated matched funds and same-date verification' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
COMMIT;

