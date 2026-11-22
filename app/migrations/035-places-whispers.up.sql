-- Known places and whispers (2026-11-22). Additive only.
-- known_places_learned: places a character heard of in a conversation (his own places, schedule
-- places and places of events he took part in are known anyway, derived, not stored).
CREATE TABLE IF NOT EXISTS known_places_learned(
  character_id TEXT NOT NULL REFERENCES characters(id),
  location_id TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  rewound_at TEXT,
  PRIMARY KEY(character_id,location_id));
-- character_whispers: a thought the owner plants in a character (Generative Agents "whisper").
-- An owner action like the director notes: not undone by a rewind; withdrawn explicitly.
CREATE TABLE IF NOT EXISTS character_whispers(
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  text TEXT NOT NULL,
  world_day TEXT NOT NULL,
  memory_id TEXT,
  created_at TEXT NOT NULL,
  withdrawn_at TEXT);
