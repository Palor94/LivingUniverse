-- Play mode: Palor's live conversations with characters. Additive only.
CREATE TABLE IF NOT EXISTS play_conversations(
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  location_id TEXT,
  channel TEXT NOT NULL CHECK(channel IN ('in_person','phone')),
  world_day TEXT NOT NULL,
  slot TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','closed')),
  summary_json TEXT,
  created_at TEXT NOT NULL,
  closed_at TEXT);
CREATE TABLE IF NOT EXISTS play_lines(
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES play_conversations(id),
  speaker TEXT NOT NULL CHECK(speaker IN ('palor','character')),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS play_lines_conversation ON play_lines(conversation_id);
