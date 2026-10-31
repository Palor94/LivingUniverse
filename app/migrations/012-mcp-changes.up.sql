CREATE TABLE IF NOT EXISTS mcp_changes (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  change_hash TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('character_create','character_update','relationship_update')),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','applied','conflict','expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  applied_at TEXT,
  result_json TEXT
);
