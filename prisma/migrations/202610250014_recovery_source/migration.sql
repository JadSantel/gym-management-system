BEGIN;
-- Corroboration references identify an individual original collection, not a whole cash book.
CREATE UNIQUE INDEX investigation_recovered_collection ON investigation_events(gym_id, independent_evidence_reference) WHERE kind = 'RECOVER';
COMMIT;
