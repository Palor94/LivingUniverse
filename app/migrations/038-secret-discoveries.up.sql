-- 2026-11-22: Palor caught a character at a secret or private routine of his (rewindable).
CREATE TABLE IF NOT EXISTS secret_discoveries(
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  activity TEXT NOT NULL,
  location_id TEXT,
  world_day TEXT NOT NULL,
  conversation_id TEXT,
  created_at TEXT NOT NULL,
  rewound_at TEXT
);
CREATE INDEX IF NOT EXISTS secret_discoveries_character ON secret_discoveries(character_id);
