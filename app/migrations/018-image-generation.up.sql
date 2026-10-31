CREATE TABLE IF NOT EXISTS image_generation_runs(
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 manifest_json TEXT NOT NULL, manifest_hash TEXT NOT NULL, status TEXT NOT NULL,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, approved_by TEXT,
 approved_at TEXT, error_code TEXT
);
CREATE TABLE IF NOT EXISTS image_generation_outputs(
 run_id TEXT PRIMARY KEY REFERENCES image_generation_runs(id),
 media_id TEXT NOT NULL REFERENCES media(id), sha256 TEXT NOT NULL,
 size INTEGER NOT NULL, receipt_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS image_generation_events(
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES image_generation_runs(id),
 event TEXT NOT NULL, actor TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL
);
