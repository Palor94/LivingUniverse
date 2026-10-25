-- Additive and idempotent: existing records start as needing review.
CREATE TABLE IF NOT EXISTS media_categorization (
  media_id TEXT PRIMARY KEY REFERENCES media(id),
  complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN (0,1)),
  updated_at TEXT NOT NULL
);
