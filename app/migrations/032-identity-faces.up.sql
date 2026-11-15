-- Local face identity (2026-11-12). Additive only; never canon.
-- identity_faces: faces found in a picture by the local method (InsightFace SCRFD + ArcFace),
-- one row per face, with its normalised box and 512-d embedding. file_key (size + mtime) ties a
-- row to the exact file version; a changed file is analysed again.
CREATE TABLE IF NOT EXISTS identity_faces(
  media_id TEXT NOT NULL,
  method TEXT NOT NULL,
  file_key TEXT NOT NULL,
  face_index INTEGER NOT NULL,
  box_json TEXT,
  det_score REAL,
  face_px INTEGER,
  embedding BLOB,
  created_at TEXT NOT NULL,
  PRIMARY KEY(media_id,method,face_index));
-- A scanned picture without faces still gets one row (face_index -1, no embedding), so it is not
-- scanned again.
-- identity_feedback: the owner's "no, not him" on a suggestion. Only hides that suggestion; it is
-- not training data.
CREATE TABLE IF NOT EXISTS identity_feedback(
  media_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK(verdict IN ('no')),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(media_id,character_id));
