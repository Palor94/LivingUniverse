CREATE TABLE IF NOT EXISTS location_profiles(
  location_id TEXT PRIMARY KEY REFERENCES locations(id),
  english_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  parent_id TEXT REFERENCES locations(id)
);
CREATE INDEX IF NOT EXISTS location_profiles_parent ON location_profiles(parent_id);
