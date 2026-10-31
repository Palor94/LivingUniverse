CREATE TABLE IF NOT EXISTS mcp_reference_changes (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  change_hash TEXT NOT NULL,
  character_id TEXT NOT NULL REFERENCES characters(id),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','applied','conflict','expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  applied_at TEXT,
  result_json TEXT
);
