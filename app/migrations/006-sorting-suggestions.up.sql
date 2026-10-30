CREATE TABLE IF NOT EXISTS sorting_suggestions (
  id TEXT PRIMARY KEY, media_id TEXT NOT NULL REFERENCES media(id),
  character_id TEXT NOT NULL REFERENCES characters(id), canon_id TEXT NOT NULL REFERENCES canon(id),
  method TEXT NOT NULL, target_signature TEXT NOT NULL, target_sha256 TEXT NOT NULL,
  evidence_json TEXT NOT NULL, context_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sorting_suggestions_by_media ON sorting_suggestions(media_id);
CREATE TABLE IF NOT EXISTS suggestion_feedback (
  id TEXT PRIMARY KEY, suggestion_id TEXT NOT NULL REFERENCES sorting_suggestions(id),
  decision TEXT NOT NULL CHECK(decision IN ('accepted','rejected','reopened')),
  notes TEXT NOT NULL, face_verdict TEXT NOT NULL, body_verdict TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS suggestion_feedback_by_suggestion ON suggestion_feedback(suggestion_id);
