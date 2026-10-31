CREATE TABLE IF NOT EXISTS character_reference_crops(
 media_id TEXT NOT NULL REFERENCES media(id),
 character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('face','body','detail','general')),
 crop_json TEXT NOT NULL,
 source_sha256 TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(media_id,character_id,role)
);
