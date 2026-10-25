BEGIN;
-- A monotonic order distinguishes independently checked replacements even within one millisecond.
ALTER TABLE closing_checks ADD COLUMN ordinal serial UNIQUE;
GRANT USAGE ON SEQUENCE closing_checks_ordinal_seq TO gym_runtime;
COMMIT;
