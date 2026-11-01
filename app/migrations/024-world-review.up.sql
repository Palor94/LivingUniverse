CREATE TABLE IF NOT EXISTS world_review_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
INSERT OR IGNORE INTO world_review_schema VALUES(1,1);
CREATE TABLE IF NOT EXISTS world_review_manifests(id TEXT PRIMARY KEY,manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS world_review_sources(
 id TEXT PRIMARY KEY,media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
 source_sha256 TEXT NOT NULL,source_path TEXT NOT NULL,source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),raw_json TEXT NOT NULL CHECK(json_valid(raw_json)),
 result_hash TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(media_id,source_sha256,result_hash)
);
CREATE INDEX IF NOT EXISTS world_review_media ON world_review_sources(media_id);
CREATE TABLE IF NOT EXISTS world_review_documents(
 source_id TEXT PRIMARY KEY REFERENCES world_review_sources(id) ON DELETE CASCADE,
 version INTEGER NOT NULL DEFAULT 0,document_json TEXT NOT NULL CHECK(json_valid(document_json)),updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS world_review_changes(
 id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES world_review_sources(id) ON DELETE CASCADE,
 version INTEGER NOT NULL,request_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('save','undo')),
 before_json TEXT NOT NULL CHECK(json_valid(before_json)),after_json TEXT NOT NULL CHECK(json_valid(after_json)),created_at TEXT NOT NULL,
 UNIQUE(source_id,version)
);
CREATE TABLE IF NOT EXISTS world_review_tombstones(media_id TEXT PRIMARY KEY,reason TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS world_review_trial(media_id TEXT PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS world_review_facts(
 source_id TEXT NOT NULL REFERENCES world_review_sources(id) ON DELETE CASCADE,fact_id TEXT NOT NULL,
 facet TEXT NOT NULL,hu TEXT NOT NULL,en TEXT NOT NULL,state TEXT NOT NULL,uncertain INTEGER NOT NULL,
 participant_id TEXT NOT NULL,activity_id TEXT NOT NULL,PRIMARY KEY(source_id,fact_id)
);
CREATE INDEX IF NOT EXISTS world_review_fact_search ON world_review_facts(facet,state,source_id);
CREATE TRIGGER IF NOT EXISTS world_review_forget_hidden AFTER INSERT ON media_hidden BEGIN
 INSERT OR IGNORE INTO world_review_tombstones VALUES(NEW.media_id,'catalogue_removal',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
 DELETE FROM world_review_sources WHERE media_id=NEW.media_id;
 DELETE FROM world_review_trial WHERE media_id=NEW.media_id;
END;
CREATE TRIGGER IF NOT EXISTS world_review_forget_deleted BEFORE DELETE ON media BEGIN
 INSERT OR IGNORE INTO world_review_tombstones VALUES(OLD.id,'catalogue_deletion',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
 DELETE FROM world_review_sources WHERE media_id=OLD.id;
 DELETE FROM world_review_trial WHERE media_id=OLD.id;
END;
INSERT OR IGNORE INTO world_review_tombstones SELECT media_id,'already_removed',created_at FROM media_hidden;
