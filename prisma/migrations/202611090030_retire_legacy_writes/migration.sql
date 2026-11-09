BEGIN;
REVOKE INSERT ON TABLE legacy_records FROM gym_runtime;
COMMIT;
