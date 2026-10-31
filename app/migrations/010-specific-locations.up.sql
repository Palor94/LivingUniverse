CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
  tag_id TEXT REFERENCES structured_tags(id), folder TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_locations (
  media_id TEXT PRIMARY KEY REFERENCES media(id),
  location_id TEXT NOT NULL REFERENCES locations(id)
);
