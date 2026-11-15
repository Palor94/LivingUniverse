CREATE TABLE IF NOT EXISTS generation_feedback(
 id TEXT PRIMARY KEY,
 request_key TEXT NOT NULL UNIQUE,
 request_hash TEXT NOT NULL,
 media_id TEXT NOT NULL REFERENCES media(id),
 character_id TEXT NOT NULL REFERENCES characters(id),
 run_id TEXT REFERENCES image_generation_runs(id),
 decision TEXT NOT NULL,
 rating INTEGER,
 face_verdict TEXT NOT NULL,
 body_verdict TEXT NOT NULL,
 notes TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS generation_feedback_by_media ON generation_feedback(media_id, character_id);
CREATE INDEX IF NOT EXISTS generation_feedback_by_run ON generation_feedback(run_id);

CREATE TABLE IF NOT EXISTS character_memories(
 id TEXT PRIMARY KEY,
 character_id TEXT NOT NULL REFERENCES characters(id),
 version INTEGER NOT NULL,
 kind TEXT NOT NULL,
 text TEXT NOT NULL,
 related_event_id TEXT,
 visibility TEXT NOT NULL,
 status TEXT NOT NULL,
 belief_accuracy TEXT NOT NULL,
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS character_memory_revisions(
 id TEXT PRIMARY KEY,
 memory_id TEXT NOT NULL REFERENCES character_memories(id),
 version INTEGER NOT NULL,
 kind TEXT NOT NULL,
 text TEXT NOT NULL,
 related_event_id TEXT,
 visibility TEXT NOT NULL,
 status TEXT NOT NULL,
 belief_accuracy TEXT NOT NULL,
 reason TEXT NOT NULL,
 actor TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(memory_id, version)
);
CREATE INDEX IF NOT EXISTS character_memories_by_character ON character_memories(character_id, status);

CREATE TABLE IF NOT EXISTS mcp_memory_changes(
 id TEXT PRIMARY KEY,
 request_key TEXT NOT NULL UNIQUE,
 request_hash TEXT NOT NULL,
 change_hash TEXT NOT NULL,
 character_id TEXT NOT NULL REFERENCES characters(id),
 payload_json TEXT NOT NULL,
 status TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 approved_by TEXT,
 approved_at TEXT,
 applied_at TEXT,
 result_json TEXT
);

CREATE TABLE IF NOT EXISTS mcp_event_changes(
 id TEXT PRIMARY KEY,
 request_key TEXT NOT NULL UNIQUE,
 request_hash TEXT NOT NULL,
 change_hash TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 status TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 approved_by TEXT,
 approved_at TEXT,
 applied_at TEXT,
 result_json TEXT
);

CREATE TABLE IF NOT EXISTS mcp_clock_changes(
 id TEXT PRIMARY KEY,
 request_key TEXT NOT NULL UNIQUE,
 request_hash TEXT NOT NULL,
 change_hash TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 status TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 approved_by TEXT,
 approved_at TEXT,
 applied_at TEXT,
 result_json TEXT
);
