CREATE TABLE IF NOT EXISTS tag_groups (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS structured_tags (
  id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES tag_groups(id),
  name TEXT NOT NULL, name_key TEXT NOT NULL, UNIQUE(group_id,name_key)
);
CREATE TABLE IF NOT EXISTS media_tags (
  media_id TEXT NOT NULL REFERENCES media(id), tag_id TEXT NOT NULL REFERENCES structured_tags(id),
  PRIMARY KEY(media_id,tag_id)
);
CREATE INDEX IF NOT EXISTS media_tags_by_tag ON media_tags(tag_id,media_id);
CREATE TABLE IF NOT EXISTS legacy_tag_mappings (
  source_key TEXT NOT NULL, tag_id TEXT NOT NULL REFERENCES structured_tags(id),
  source_text TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(source_key,tag_id)
);
