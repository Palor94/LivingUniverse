CREATE TABLE IF NOT EXISTS folder_changes (
  id TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id),
  source TEXT NOT NULL, destination TEXT NOT NULL, status TEXT NOT NULL,
  manifest_json TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
