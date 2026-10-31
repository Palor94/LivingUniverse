-- Roll back code first. Preserve a verified backup. No originals, associations,
-- profiles or canon are removed; pending chunk uploads become unavailable.
DROP TABLE IF EXISTS media_upload_chunks;
DROP TABLE IF EXISTS media_uploads;
DROP TABLE IF EXISTS media_import_metadata;
DROP TABLE IF EXISTS media_import_targets;
