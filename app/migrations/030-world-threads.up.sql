-- Open threads (2026-11-12, plan step 2.3): promises and arranged plans between Palor and a
-- character ("pénteken felhívlak"), taken from the conversation summary that already runs.
-- They come back in later prompts until kept, dropped or lapsed. Additive only.
CREATE TABLE IF NOT EXISTS world_threads(
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  promised_by TEXT NOT NULL CHECK(promised_by IN ('palor','character')),
  text TEXT NOT NULL,
  due_day TEXT,
  status TEXT NOT NULL CHECK(status IN ('open','kept','dropped','lapsed')),
  conversation_id TEXT,
  noted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  rewound_at TEXT);
CREATE INDEX IF NOT EXISTS world_threads_character ON world_threads(character_id,status);
