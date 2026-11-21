CREATE TABLE IF NOT EXISTS image_generation_output_items(
 run_id TEXT NOT NULL REFERENCES image_generation_runs(id),
 item_index INTEGER NOT NULL,
 media_id TEXT NOT NULL REFERENCES media(id),
 sha256 TEXT NOT NULL,
 size INTEGER NOT NULL,
 receipt_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(run_id,item_index)
);
