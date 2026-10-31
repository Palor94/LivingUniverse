-- Stop the application and export a backup before reverting feature code.
-- Imported originals, import provenance, media IDs and canon are retained.
DROP TABLE IF EXISTS image_generation_events;
DROP TABLE IF EXISTS image_generation_outputs;
DROP TABLE IF EXISTS image_generation_runs;
