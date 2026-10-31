-- One event, many dossier links. Revisions are immutable application snapshots.
CREATE TABLE IF NOT EXISTS story_events(
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK(version>0),
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  import_key TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS story_event_revisions(
  event_id TEXT NOT NULL REFERENCES story_events(id),
  version INTEGER NOT NULL CHECK(version>0),
  status TEXT NOT NULL CHECK(status IN ('draft','proposed','approved','rejected','archived')),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(event_id,version)
);
CREATE TABLE IF NOT EXISTS story_event_participants(
  event_id TEXT NOT NULL REFERENCES story_events(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  role TEXT NOT NULL,
  knows INTEGER NOT NULL CHECK(knows IN (0,1)),
  PRIMARY KEY(event_id,character_id)
);
CREATE INDEX IF NOT EXISTS story_participants_character ON story_event_participants(character_id,event_id);
CREATE TABLE IF NOT EXISTS story_event_locations(
  event_id TEXT NOT NULL REFERENCES story_events(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  PRIMARY KEY(event_id,location_id)
);
-- Retain every external identity ever attached to an event, even after correction.
CREATE TABLE IF NOT EXISTS story_event_source_keys(
  source_key TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES story_events(id),
  system TEXT NOT NULL,
  external_id TEXT NOT NULL
);
