-- Additive: no original notes, roles, sorting, canon or media links are rewritten.
CREATE TABLE IF NOT EXISTS media_analysis_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
INSERT OR IGNORE INTO media_analysis_schema VALUES(1,1);
CREATE TABLE IF NOT EXISTS media_analysis_jobs(
  id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,
  provider_json TEXT NOT NULL CHECK(json_valid(provider_json)),goals_json TEXT NOT NULL CHECK(json_valid(goals_json)),
  status TEXT NOT NULL CHECK(status IN ('queued','running','paused','cancelled','completed')),
  revision INTEGER NOT NULL DEFAULT 0,pause_reason TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_analysis_items(
  id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES media_analysis_jobs(id),media_id TEXT NOT NULL REFERENCES media(id),ordinal INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed','cancelled')),
  source_json TEXT NOT NULL CHECK(json_valid(source_json)),result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  context_json TEXT CHECK(context_json IS NULL OR json_valid(context_json)),match_hash TEXT,cache_key TEXT,cache_hit INTEGER NOT NULL DEFAULT 0 CHECK(cache_hit IN (0,1)),
  attempts INTEGER NOT NULL DEFAULT 0,error_code TEXT,UNIQUE(job_id,media_id),UNIQUE(job_id,ordinal)
);
CREATE TABLE IF NOT EXISTS media_analysis_cache(
  cache_key TEXT PRIMARY KEY,provider_json TEXT NOT NULL CHECK(json_valid(provider_json)),
  source_sha256 TEXT NOT NULL,derivative_sha256 TEXT NOT NULL,result_json TEXT NOT NULL CHECK(json_valid(result_json)),created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_analysis_proposals(
  id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES media_analysis_items(id),match_hash TEXT NOT NULL,ordinal INTEGER NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected','stale')),
  UNIQUE(item_id,match_hash,ordinal)
);
CREATE TABLE IF NOT EXISTS media_analysis_decisions(
  id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,preview_hash TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('accept','reject')),status TEXT NOT NULL CHECK(status IN ('applied','rolled_back')),
  selection_json TEXT NOT NULL CHECK(json_valid(selection_json)),result_json TEXT NOT NULL CHECK(json_valid(result_json)),created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_analysis_tag_links(
  media_id TEXT NOT NULL,tag_id TEXT NOT NULL,decision_id TEXT NOT NULL REFERENCES media_analysis_decisions(id),
  PRIMARY KEY(media_id,tag_id),FOREIGN KEY(media_id,tag_id) REFERENCES media_tags(media_id,tag_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS media_analysis_place_links(
  media_id TEXT NOT NULL REFERENCES media(id),location_id TEXT NOT NULL REFERENCES locations(id),
  decision_id TEXT NOT NULL REFERENCES media_analysis_decisions(id),is_primary INTEGER NOT NULL CHECK(is_primary IN (0,1)),
  PRIMARY KEY(media_id,location_id)
);
CREATE TRIGGER IF NOT EXISTS analysis_primary_deleted AFTER DELETE ON media_locations BEGIN
  DELETE FROM media_analysis_place_links WHERE media_id=OLD.media_id AND location_id=OLD.location_id AND is_primary=1;
END;
CREATE TRIGGER IF NOT EXISTS analysis_primary_changed AFTER UPDATE OF location_id ON media_locations WHEN OLD.location_id<>NEW.location_id BEGIN
  DELETE FROM media_analysis_place_links WHERE media_id=OLD.media_id AND location_id=OLD.location_id AND is_primary=1;
END;
CREATE TRIGGER IF NOT EXISTS analysis_secondary_deleted AFTER DELETE ON media_location_links BEGIN
  DELETE FROM media_analysis_place_links WHERE media_id=OLD.media_id AND location_id=OLD.location_id AND is_primary=0;
END;
CREATE INDEX IF NOT EXISTS analysis_items_queue ON media_analysis_items(job_id,status,ordinal);
CREATE INDEX IF NOT EXISTS analysis_proposals_item ON media_analysis_proposals(item_id,match_hash,status);
