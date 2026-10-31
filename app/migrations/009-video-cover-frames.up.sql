CREATE TABLE IF NOT EXISTS character_cover_frames (
  character_id TEXT PRIMARY KEY REFERENCES characters(id),
  media_id TEXT NOT NULL REFERENCES media(id),
  time_seconds REAL NOT NULL CHECK(time_seconds>=0),
  data_url TEXT NOT NULL,
  source_crop_json TEXT NOT NULL,
  source_size INTEGER NOT NULL,
  source_mtime TEXT NOT NULL,
  captured_at TEXT NOT NULL
);
