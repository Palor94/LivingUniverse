-- N1 (2026-11-22): owner-authored hidden events that open by conditions (after Covel story-events, MIT).
CREATE TABLE IF NOT EXISTS hidden_events(
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  condition_json TEXT NOT NULL CHECK(json_valid(condition_json)),
  character_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(character_ids_json)),
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('draft','proposed','approved','archived')),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hidden_event_reveals(
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES hidden_events(id),
  world_day TEXT NOT NULL,
  slot TEXT NOT NULL,
  character_id TEXT,
  created_at TEXT NOT NULL,
  rewound_at TEXT
);
CREATE INDEX IF NOT EXISTS hidden_event_reveals_slot ON hidden_event_reveals(world_day,slot);
