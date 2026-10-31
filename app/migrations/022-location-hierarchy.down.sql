-- Run only through rollbackLocationHierarchy. It refuses homonyms and retained
-- edit history, verifies a backup, and never drops accepted new data silently.
DROP TRIGGER location_profile_parent_insert;
DROP TRIGGER location_profile_parent_update;
DROP TRIGGER location_parent_update;
CREATE TABLE locations_previous (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
  tag_id TEXT REFERENCES structured_tags(id), folder TEXT, created_at TEXT NOT NULL
);
INSERT INTO locations_previous SELECT id,name,name_key,tag_id,folder,created_at FROM locations;
DROP TABLE locations;
ALTER TABLE locations_previous RENAME TO locations;
DROP TABLE location_changes;
DROP TABLE location_schema;
