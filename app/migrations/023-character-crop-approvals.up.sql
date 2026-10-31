CREATE TABLE IF NOT EXISTS character_crop_approvals(
 id TEXT PRIMARY KEY,
 character_id TEXT NOT NULL REFERENCES characters(id),
 media_id TEXT NOT NULL REFERENCES media(id),
 role TEXT NOT NULL CHECK(role IN ('face','body','detail','general')),
 reference_id TEXT NOT NULL,
 revision_id TEXT NOT NULL REFERENCES canon(id),
 operation TEXT NOT NULL CHECK(operation IN ('approve','undo')),
 undo_of TEXT UNIQUE REFERENCES character_crop_approvals(id),
 request_hash TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 actor TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS character_crop_approval_history ON character_crop_approvals(character_id,media_id,created_at);
