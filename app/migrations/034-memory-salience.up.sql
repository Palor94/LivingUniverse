-- Memory salience (E7, 2026-11-21). Additive side table, so the existing positional inserts into
-- character_memories stay valid. importance 1–5 from the save point (3 when unknown); a memory
-- that keeps coming back is reinforced (recall_count, last_recalled_day = world day).
CREATE TABLE IF NOT EXISTS memory_salience(
  memory_id TEXT PRIMARY KEY REFERENCES character_memories(id),
  importance INTEGER NOT NULL DEFAULT 3 CHECK(importance BETWEEN 1 AND 5),
  recall_count INTEGER NOT NULL DEFAULT 0,
  last_recalled_day TEXT);
