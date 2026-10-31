CREATE TABLE IF NOT EXISTS media_fingerprints (
  media_id TEXT PRIMARY KEY REFERENCES media(id),
  signature TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  visual_hash TEXT,
  visual_version TEXT,
  width INTEGER,
  height INTEGER,
  checked_at TEXT NOT NULL
);
