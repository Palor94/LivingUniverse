-- Export the catalogue first. Roll back the application code together with this
-- migration; only the new completion flags are removed, never existing metadata.
DROP TABLE IF EXISTS media_categorization;
