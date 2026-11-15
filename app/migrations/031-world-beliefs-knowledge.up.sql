-- Livelier characters (2026-11-12, plan steps 2.4 and 2.5). Additive only.
-- world_beliefs: a character's own, subjective conclusions about people, condensed from his
-- memories by one world-engine call. They can be wrong, are kept apart from events, never touch
-- canon, and are listed for the owner on the Élő világ page.
CREATE TABLE IF NOT EXISTS world_beliefs(
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  about_id TEXT,
  about_name TEXT NOT NULL,
  text TEXT NOT NULL,
  memory_ids_json TEXT NOT NULL,
  world_day TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  rewound_at TEXT);
CREATE INDEX IF NOT EXISTS world_beliefs_character ON world_beliefs(character_id,created_at);
-- world_knowledge: who heard about an event from whom. Participants know their own events;
-- a fact reaches anyone else only through a recorded meeting with someone who knows it.
CREATE TABLE IF NOT EXISTS world_knowledge(
  event_id TEXT NOT NULL,
  character_id TEXT NOT NULL REFERENCES characters(id),
  via_character_id TEXT NOT NULL,
  meeting_event_id TEXT NOT NULL,
  world_day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  rewound_at TEXT,
  PRIMARY KEY(event_id,character_id));
