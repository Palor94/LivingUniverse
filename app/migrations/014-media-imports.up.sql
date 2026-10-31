CREATE TABLE IF NOT EXISTS media_imports(
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 character_id TEXT NOT NULL REFERENCES characters(id), provenance_json TEXT NOT NULL,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS imported_media_blobs(
 sha256 TEXT PRIMARY KEY, media_id TEXT NOT NULL UNIQUE REFERENCES media(id)
);
CREATE TABLE IF NOT EXISTS media_import_items(
 id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES media_imports(id), slot_key TEXT NOT NULL,
 status TEXT NOT NULL, sha256 TEXT, media_id TEXT REFERENCES media(id), filename TEXT,
 content_type TEXT, size INTEGER, provenance_json TEXT, error_code TEXT, created_at TEXT NOT NULL,
 UNIQUE(import_id,slot_key)
);
CREATE TABLE IF NOT EXISTS media_import_events(
 id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES media_imports(id), slot_key TEXT NOT NULL,
 event TEXT NOT NULL, error_code TEXT, created_at TEXT NOT NULL
);
