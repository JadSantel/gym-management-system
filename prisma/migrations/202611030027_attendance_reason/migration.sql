-- SQL CHECK treats NULL as unknown; require an actual reason independently of application validation.
ALTER TABLE attendance_events ADD CONSTRAINT attendance_correction_reason_required
  CHECK (kind IN ('IN','OUT') OR (reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500));
