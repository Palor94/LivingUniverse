-- Run only through migrateLocationHierarchy: verified backup, foreign_keys OFF
-- outside a transaction, exclusive table rebuild, then full integrity checks.
CREATE TABLE locations_next (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL,
  tag_id TEXT REFERENCES structured_tags(id), folder TEXT, created_at TEXT NOT NULL,
  parent_id TEXT REFERENCES locations(id) DEFERRABLE INITIALLY DEFERRED
);
INSERT INTO locations_next(id,name,name_key,tag_id,folder,created_at,parent_id)
  SELECT l.id,l.name,l.name_key,l.tag_id,l.folder,l.created_at,p.parent_id
  FROM locations l LEFT JOIN location_profiles p ON p.location_id=l.id;
DROP TABLE locations;
ALTER TABLE locations_next RENAME TO locations;
CREATE UNIQUE INDEX location_root_name ON locations(name_key) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX location_sibling_name ON locations(parent_id,name_key) WHERE parent_id IS NOT NULL;
CREATE INDEX location_children ON locations(parent_id,id);
-- Existing profile parents remain a compatibility mirror, never a second tree.
CREATE TRIGGER location_profile_parent_insert AFTER INSERT ON location_profiles
WHEN NEW.parent_id IS NOT (SELECT parent_id FROM locations WHERE id=NEW.location_id)
BEGIN UPDATE locations SET parent_id=NEW.parent_id WHERE id=NEW.location_id; END;
CREATE TRIGGER location_profile_parent_update AFTER UPDATE OF parent_id ON location_profiles
WHEN NEW.parent_id IS NOT (SELECT parent_id FROM locations WHERE id=NEW.location_id)
BEGIN UPDATE locations SET parent_id=NEW.parent_id WHERE id=NEW.location_id; END;
CREATE TRIGGER location_parent_update AFTER UPDATE OF parent_id ON locations
WHEN NEW.parent_id IS NOT OLD.parent_id
BEGIN
  INSERT INTO location_profiles(location_id,parent_id) VALUES(NEW.id,NEW.parent_id)
  ON CONFLICT(location_id) DO UPDATE SET parent_id=excluded.parent_id;
END;
CREATE TABLE location_changes (
  id TEXT PRIMARY KEY, operation TEXT NOT NULL, location_id TEXT NOT NULL REFERENCES locations(id),
  request_key TEXT UNIQUE, request_hash TEXT,
  before_json TEXT NOT NULL CHECK(json_valid(before_json)),
  after_json TEXT NOT NULL CHECK(json_valid(after_json)),
  undo_of TEXT REFERENCES location_changes(id) DEFERRABLE INITIALLY DEFERRED, created_at TEXT NOT NULL
);
CREATE TABLE location_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
INSERT INTO location_schema VALUES(1,2);
