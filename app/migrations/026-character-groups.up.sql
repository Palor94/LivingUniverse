-- Character records that stand for several different people (e.g. "Hajléktalanok").
-- A group can be chosen for many people in one picture, never holds new approved
-- references and is never used for image generation. Additive; see the down script.
CREATE TABLE IF NOT EXISTS character_groups(
  character_id TEXT PRIMARY KEY REFERENCES characters(id),
  created_at TEXT NOT NULL
);
