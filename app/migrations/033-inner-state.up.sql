-- Inner state (E2, 2026-11-21, owner: living, different characters). Additive only.
-- One row per change of a character's inner state, written at a save point from his own
-- point of view: mood and its strength, why, what occupies him (up to three concerns) and
-- what he wants from Palor right now. The newest live row is his current state; the mood
-- fades with world days by his profile, the concerns stay until a later state replaces them.
-- Rewind marks rows rewound_at (never deleted), like world_beliefs.
CREATE TABLE IF NOT EXISTS character_inner_states(
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  mood TEXT NOT NULL,
  intensity INTEGER NOT NULL CHECK(intensity BETWEEN 0 AND 3),
  reason TEXT NOT NULL,
  concerns_json TEXT NOT NULL,
  wants_from_palor TEXT NOT NULL,
  world_day TEXT NOT NULL,
  event_id TEXT,
  conversation_id TEXT,
  created_at TEXT NOT NULL,
  rewound_at TEXT);
CREATE INDEX IF NOT EXISTS character_inner_states_character ON character_inner_states(character_id,created_at);
