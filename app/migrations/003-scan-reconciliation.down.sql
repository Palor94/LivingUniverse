-- Export first and roll back the matching application code as well.
-- Only scan observations and unconfirmed suggestions are removed.
DROP TABLE IF EXISTS scan_candidates;
DROP TABLE IF EXISTS media_scan_state;
