CREATE TABLE IF NOT EXISTS media_image_edits(
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
