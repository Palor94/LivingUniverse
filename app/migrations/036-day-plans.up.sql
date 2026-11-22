-- Day plans (S3, 2026-11-22). Additive only. A day part that differs from the weekly routine
-- because something is due today (a plan with Palor, a turning point yesterday), from the
-- once-a-day morning step. Rewind marks rows rewound_at.
CREATE TABLE IF NOT EXISTS day_plans(
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  world_day TEXT NOT NULL,
  slot TEXT NOT NULL,
  location_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  rewound_at TEXT);
CREATE INDEX IF NOT EXISTS day_plans_day ON day_plans(world_day,character_id);
