-- World engine (Play mode): character place links, relationship levels, off-screen
-- events, messages to Palor and AI usage. Additive only; no existing table changes.
CREATE TABLE IF NOT EXISTS world_places(
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  role TEXT NOT NULL CHECK(role IN ('home','work','routine','other')),
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK(source IN ('suggested','creator')),
  created_at TEXT NOT NULL,
  UNIQUE(character_id,location_id,role));
CREATE TABLE IF NOT EXISTS world_relationship_levels(
  source_id TEXT NOT NULL REFERENCES characters(id),
  target_id TEXT NOT NULL REFERENCES characters(id),
  level INTEGER NOT NULL CHECK(level BETWEEN -2 AND 5),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(source_id,target_id));
-- Every level change is kept, so a rewind can append the earlier value again.
CREATE TABLE IF NOT EXISTS world_level_revisions(
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  previous_level INTEGER,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  event_id TEXT,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS world_events(
  id TEXT PRIMARY KEY,
  world_day TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('everyday','meeting','serious')),
  status TEXT NOT NULL CHECK(status IN ('applied','proposed','accepted','refused')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  model TEXT NOT NULL,
  seen_at TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS world_events_day ON world_events(world_day);
CREATE TABLE IF NOT EXISTS world_messages(
  id TEXT PRIMARY KEY,
  from_character_id TEXT NOT NULL REFERENCES characters(id),
  text TEXT NOT NULL,
  world_day TEXT NOT NULL,
  event_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS world_usage(
  day TEXT PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0);
