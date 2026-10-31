-- Schema only, generated from a fresh synthetic empty catalogue on 2026-10-31.
-- No production database or user rows were read. Runtime migrations remain authoritative.
PRAGMA foreign_keys = ON;
CREATE TABLE application_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);

CREATE TABLE canon(id TEXT PRIMARY KEY,character_id TEXT NOT NULL REFERENCES characters(id),parent_id TEXT REFERENCES canon(id),appearance TEXT NOT NULL,references_json TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);

CREATE TABLE character_cover_frames (
  character_id TEXT PRIMARY KEY REFERENCES characters(id),
  media_id TEXT NOT NULL REFERENCES media(id),
  time_seconds REAL NOT NULL CHECK(time_seconds>=0),
  data_url TEXT NOT NULL,
  source_crop_json TEXT NOT NULL,
  source_size INTEGER NOT NULL,
  source_mtime TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE TABLE character_crop_approvals(
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

CREATE TABLE character_reference_crops(
 media_id TEXT NOT NULL REFERENCES media(id),
 character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('face','body','detail','general')),
 crop_json TEXT NOT NULL,
 source_sha256 TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(media_id,character_id,role)
);

CREATE TABLE character_ui(character_id TEXT PRIMARY KEY REFERENCES characters(id),cover_crop TEXT,merged_into TEXT REFERENCES characters(id));

CREATE TABLE characters(id TEXT PRIMARY KEY,name TEXT NOT NULL,aliases TEXT NOT NULL DEFAULT '',biography TEXT NOT NULL DEFAULT '',personality TEXT NOT NULL DEFAULT '',appearance TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',cover_id TEXT,created_at TEXT NOT NULL, sexuality TEXT NOT NULL DEFAULT '', speech_style TEXT NOT NULL DEFAULT '', race TEXT NOT NULL DEFAULT 'human' CHECK (race IN ('human','orc','goblin','troll','minotaur','centaur','satyr_faun','werewolf','lizardfolk_dragonborn','dwarf','ogre','bearfolk_bullfolk')));

CREATE TABLE depictions(media_id TEXT NOT NULL REFERENCES media(id),character_id TEXT NOT NULL REFERENCES characters(id),PRIMARY KEY(media_id,character_id));

CREATE TABLE file_moves(id TEXT PRIMARY KEY,media_id TEXT NOT NULL REFERENCES media(id),from_path TEXT NOT NULL,to_path TEXT NOT NULL,status TEXT NOT NULL,sha256 TEXT,created_at TEXT NOT NULL);

CREATE TABLE folder_changes (
  id TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id),
  source TEXT NOT NULL, destination TEXT NOT NULL, status TEXT NOT NULL,
  manifest_json TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE image_generation_events(
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES image_generation_runs(id),
 event TEXT NOT NULL, actor TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL
);

CREATE TABLE image_generation_outputs(
 run_id TEXT PRIMARY KEY REFERENCES image_generation_runs(id),
 media_id TEXT NOT NULL REFERENCES media(id), sha256 TEXT NOT NULL,
 size INTEGER NOT NULL, receipt_json TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE image_generation_runs(
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 manifest_json TEXT NOT NULL, manifest_hash TEXT NOT NULL, status TEXT NOT NULL,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, approved_by TEXT,
 approved_at TEXT, error_code TEXT
);

CREATE TABLE imported_media_blobs(
 sha256 TEXT PRIMARY KEY, media_id TEXT NOT NULL UNIQUE REFERENCES media(id)
);

CREATE TABLE legacy_tag_mappings (
  source_key TEXT NOT NULL, tag_id TEXT NOT NULL REFERENCES structured_tags(id),
  source_text TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(source_key,tag_id)
);

CREATE TABLE location_profiles(
  location_id TEXT PRIMARY KEY REFERENCES locations(id),
  english_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  parent_id TEXT REFERENCES locations(id)
);

CREATE TABLE locations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
  tag_id TEXT REFERENCES structured_tags(id), folder TEXT, created_at TEXT NOT NULL
);

CREATE TABLE mcp_changes (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  change_hash TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('character_create','character_update','relationship_update')),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','applied','conflict','expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  applied_at TEXT,
  result_json TEXT
);

CREATE TABLE mcp_reference_changes (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  change_hash TEXT NOT NULL,
  character_id TEXT NOT NULL REFERENCES characters(id),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','applied','conflict','expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  applied_at TEXT,
  result_json TEXT
);

CREATE TABLE media(id TEXT PRIMARY KEY,relative_path TEXT NOT NULL UNIQUE,folder TEXT NOT NULL,kind TEXT NOT NULL,size INTEGER,modified_at TEXT,created_at TEXT NOT NULL);

CREATE TABLE media_categorization (
  media_id TEXT PRIMARY KEY REFERENCES media(id),
  complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN (0,1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE media_fingerprints (
  media_id TEXT PRIMARY KEY REFERENCES media(id),
  signature TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  visual_hash TEXT,
  visual_version TEXT,
  width INTEGER,
  height INTEGER,
  checked_at TEXT NOT NULL
);

CREATE TABLE media_hidden(media_id TEXT PRIMARY KEY REFERENCES media(id),original_path TEXT NOT NULL,physical INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);

CREATE TABLE media_image_edits(
 id TEXT PRIMARY KEY,
 media_id TEXT NOT NULL REFERENCES media(id),
 status TEXT NOT NULL,
 original_sha256 TEXT NOT NULL,
 cropped_sha256 TEXT NOT NULL,
 crop_json TEXT NOT NULL,
 original_size INTEGER NOT NULL,
 original_mtime TEXT NOT NULL,
 created_at TEXT NOT NULL,
 restored_at TEXT
);

CREATE TABLE media_import_events(
 id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES media_imports(id), slot_key TEXT NOT NULL,
 event TEXT NOT NULL, error_code TEXT, created_at TEXT NOT NULL
);

CREATE TABLE media_import_items(
 id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES media_imports(id), slot_key TEXT NOT NULL,
 status TEXT NOT NULL, sha256 TEXT, media_id TEXT REFERENCES media(id), filename TEXT,
 content_type TEXT, size INTEGER, provenance_json TEXT, error_code TEXT, created_at TEXT NOT NULL,
 UNIQUE(import_id,slot_key)
);

CREATE TABLE media_import_metadata(
 import_id TEXT PRIMARY KEY REFERENCES media_imports(id),
 title TEXT NOT NULL, description TEXT NOT NULL, reference_candidate INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE media_import_targets(
 import_id TEXT NOT NULL REFERENCES media_imports(id),
 character_id TEXT NOT NULL REFERENCES characters(id),
 PRIMARY KEY(import_id,character_id)
);

CREATE TABLE media_imports(
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 character_id TEXT NOT NULL REFERENCES characters(id), provenance_json TEXT NOT NULL,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);

CREATE TABLE media_location_links(
  media_id TEXT NOT NULL REFERENCES media(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  PRIMARY KEY(media_id,location_id)
);

CREATE TABLE media_locations (
  media_id TEXT PRIMARY KEY REFERENCES media(id),
  location_id TEXT NOT NULL REFERENCES locations(id)
);

CREATE TABLE media_notes(media_id TEXT PRIMARY KEY REFERENCES media(id),tags TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '');

CREATE TABLE media_roles (
  media_id TEXT PRIMARY KEY REFERENCES media(id),
  role TEXT NOT NULL CHECK(role='location'),
  updated_at TEXT NOT NULL
);

CREATE TABLE media_scan_state (
  media_id TEXT PRIMARY KEY REFERENCES media(id),
  state TEXT NOT NULL,
  observed_size INTEGER,
  observed_mtime TEXT,
  checked_at TEXT NOT NULL,
  error TEXT
);

CREATE TABLE media_tags (
  media_id TEXT NOT NULL REFERENCES media(id), tag_id TEXT NOT NULL REFERENCES structured_tags(id),
  PRIMARY KEY(media_id,tag_id)
);

CREATE TABLE media_upload_chunks(
 upload_id TEXT NOT NULL REFERENCES media_uploads(id), offset INTEGER NOT NULL,
 size INTEGER NOT NULL, sha256 TEXT NOT NULL, PRIMARY KEY(upload_id,offset)
);

CREATE TABLE media_uploads(
 id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES media_imports(id), slot_key TEXT NOT NULL,
 request_hash TEXT NOT NULL, filename TEXT NOT NULL, content_type TEXT NOT NULL,
 size INTEGER NOT NULL, sha256 TEXT NOT NULL, received_bytes INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL, error_code TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 UNIQUE(import_id,slot_key)
);

CREATE TABLE relationships(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES characters(id),target_id TEXT NOT NULL REFERENCES characters(id),description TEXT NOT NULL,UNIQUE(source_id,target_id));

CREATE TABLE reviews(id TEXT PRIMARY KEY,media_id TEXT NOT NULL REFERENCES media(id),character_id TEXT NOT NULL REFERENCES characters(id),decision TEXT NOT NULL,rating INTEGER,notes TEXT NOT NULL,created_at TEXT NOT NULL);

CREATE TABLE scan_candidates (
  relative_path TEXT PRIMARY KEY,
  folder TEXT NOT NULL,
  kind TEXT NOT NULL,
  size INTEGER NOT NULL,
  modified_at TEXT NOT NULL,
  candidate_ids TEXT NOT NULL
);

CREATE TABLE sorted_folders(folder TEXT PRIMARY KEY,character_id TEXT NOT NULL REFERENCES characters(id));

CREATE TABLE sorting_suggestions (
  id TEXT PRIMARY KEY, media_id TEXT NOT NULL REFERENCES media(id),
  character_id TEXT NOT NULL REFERENCES characters(id), canon_id TEXT NOT NULL REFERENCES canon(id),
  method TEXT NOT NULL, target_signature TEXT NOT NULL, target_sha256 TEXT NOT NULL,
  evidence_json TEXT NOT NULL, context_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);

CREATE TABLE story_event_locations(
  event_id TEXT NOT NULL REFERENCES story_events(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  PRIMARY KEY(event_id,location_id)
);

CREATE TABLE story_event_participants(
  event_id TEXT NOT NULL REFERENCES story_events(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  role TEXT NOT NULL,
  knows INTEGER NOT NULL CHECK(knows IN (0,1)),
  PRIMARY KEY(event_id,character_id)
);

CREATE TABLE story_event_revisions(
  event_id TEXT NOT NULL REFERENCES story_events(id),
  version INTEGER NOT NULL CHECK(version>0),
  status TEXT NOT NULL CHECK(status IN ('draft','proposed','approved','rejected','archived')),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(event_id,version)
);

CREATE TABLE story_event_source_keys(
  source_key TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES story_events(id),
  system TEXT NOT NULL,
  external_id TEXT NOT NULL
);

CREATE TABLE story_events(
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK(version>0),
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  import_key TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE structured_tags (
  id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES tag_groups(id),
  name TEXT NOT NULL, name_key TEXT NOT NULL, UNIQUE(group_id,name_key)
);

CREATE TABLE suggestion_feedback (
  id TEXT PRIMARY KEY, suggestion_id TEXT NOT NULL REFERENCES sorting_suggestions(id),
  decision TEXT NOT NULL CHECK(decision IN ('accepted','rejected','reopened')),
  notes TEXT NOT NULL, face_verdict TEXT NOT NULL, body_verdict TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE tag_groups (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE
);

CREATE INDEX character_crop_approval_history ON character_crop_approvals(character_id,media_id,created_at);

CREATE INDEX location_profiles_parent ON location_profiles(parent_id);

CREATE INDEX media_location_links_location ON media_location_links(location_id);

CREATE INDEX media_tags_by_tag ON media_tags(tag_id,media_id);

CREATE INDEX sorting_suggestions_by_media ON sorting_suggestions(media_id);

CREATE INDEX story_participants_character ON story_event_participants(character_id,event_id);

CREATE INDEX suggestion_feedback_by_suggestion ON suggestion_feedback(suggestion_id);

CREATE VIEW active_media AS SELECT m.* FROM media m WHERE NOT EXISTS(SELECT 1 FROM media_hidden h WHERE h.media_id=m.id);
