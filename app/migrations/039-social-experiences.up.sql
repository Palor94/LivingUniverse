-- Append-only, directed evidence. Scores describe changes since recorded evidence, not canon.
CREATE TABLE IF NOT EXISTS social_experiences(
 id TEXT PRIMARY KEY,
 character_id TEXT NOT NULL REFERENCES characters(id),
 target_id TEXT NOT NULL REFERENCES characters(id),
 event_id TEXT NOT NULL REFERENCES world_events(id),
 conversation_id TEXT,
 memory_id TEXT REFERENCES character_memories(id),
 kind TEXT NOT NULL,
 quote TEXT NOT NULL,
 line_id TEXT REFERENCES play_lines(id),
 reading TEXT NOT NULL,
 deltas_json TEXT NOT NULL CHECK(json_valid(deltas_json)),
 via_character_id TEXT NOT NULL DEFAULT '',
 method TEXT NOT NULL,
 world_day TEXT NOT NULL,
 created_at TEXT NOT NULL,
 rewound_at TEXT,
 UNIQUE(character_id,event_id,kind,quote,via_character_id)
);
CREATE INDEX IF NOT EXISTS social_experiences_pair ON social_experiences(character_id,target_id,created_at);
