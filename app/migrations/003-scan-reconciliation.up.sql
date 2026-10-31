CREATE TABLE IF NOT EXISTS media_scan_state (
  media_id TEXT PRIMARY KEY REFERENCES media(id),
  state TEXT NOT NULL,
  observed_size INTEGER,
  observed_mtime TEXT,
  checked_at TEXT NOT NULL,
  error TEXT
);
CREATE TABLE IF NOT EXISTS scan_candidates (
  relative_path TEXT PRIMARY KEY,
  folder TEXT NOT NULL,
  kind TEXT NOT NULL,
  size INTEGER NOT NULL,
  modified_at TEXT NOT NULL,
  candidate_ids TEXT NOT NULL
);
