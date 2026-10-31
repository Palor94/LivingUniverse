-- Additive: no rewriting of original notes, names, tags, IDs or assignments.
CREATE TABLE IF NOT EXISTS tag_localizations (
  tag_id TEXT PRIMARY KEY REFERENCES structured_tags(id),
  hu_name TEXT NOT NULL DEFAULT '', en_name TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS tag_aliases (
  tag_id TEXT NOT NULL REFERENCES structured_tags(id),
  language TEXT NOT NULL CHECK(language IN ('hu','en','und')),
  alias TEXT NOT NULL, alias_key TEXT NOT NULL,
  PRIMARY KEY(tag_id,alias_key)
);
CREATE INDEX IF NOT EXISTS tag_aliases_by_key ON tag_aliases(alias_key,tag_id);
CREATE TABLE IF NOT EXISTS note_tag_runs (
  id TEXT PRIMARY KEY, source TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('applied','rolled_back')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS note_tag_links (
  media_id TEXT NOT NULL, tag_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES note_tag_runs(id),
  PRIMARY KEY(media_id,tag_id),
  FOREIGN KEY(media_id,tag_id) REFERENCES media_tags(media_id,tag_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS note_tag_proposals (
  media_id TEXT NOT NULL REFERENCES media(id), token_key TEXT NOT NULL,
  token TEXT NOT NULL, reason TEXT NOT NULL CHECK(reason IN ('unknown','ambiguous','location')),
  PRIMARY KEY(media_id,token_key)
);
CREATE TABLE IF NOT EXISTS note_tag_proposal_changes (
  run_id TEXT NOT NULL REFERENCES note_tag_runs(id),
  media_id TEXT NOT NULL REFERENCES media(id), token_key TEXT NOT NULL,
  before_json TEXT NOT NULL, after_json TEXT NOT NULL,
  PRIMARY KEY(run_id,media_id,token_key)
);
