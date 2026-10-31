CREATE TABLE IF NOT EXISTS media_roles (
  media_id TEXT PRIMARY KEY REFERENCES media(id),
  role TEXT NOT NULL CHECK(role='location'),
  updated_at TEXT NOT NULL
);
