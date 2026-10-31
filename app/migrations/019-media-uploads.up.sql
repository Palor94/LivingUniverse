CREATE TABLE IF NOT EXISTS media_import_targets(
 import_id TEXT NOT NULL REFERENCES media_imports(id),
 character_id TEXT NOT NULL REFERENCES characters(id),
 PRIMARY KEY(import_id,character_id)
);
CREATE TABLE IF NOT EXISTS media_import_metadata(
 import_id TEXT PRIMARY KEY REFERENCES media_imports(id),
 title TEXT NOT NULL, description TEXT NOT NULL, reference_candidate INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS media_uploads(
 id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES media_imports(id), slot_key TEXT NOT NULL,
 request_hash TEXT NOT NULL, filename TEXT NOT NULL, content_type TEXT NOT NULL,
 size INTEGER NOT NULL, sha256 TEXT NOT NULL, received_bytes INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL, error_code TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 UNIQUE(import_id,slot_key)
);
CREATE TABLE IF NOT EXISTS media_upload_chunks(
 upload_id TEXT NOT NULL REFERENCES media_uploads(id), offset INTEGER NOT NULL,
 size INTEGER NOT NULL, sha256 TEXT NOT NULL, PRIMARY KEY(upload_id,offset)
);
