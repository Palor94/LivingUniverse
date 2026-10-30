UPDATE character_ui SET cover_crop=NULL WHERE character_id IN (
  SELECT f.character_id FROM character_cover_frames f JOIN characters c ON c.id=f.character_id WHERE c.cover_id=f.media_id
);
UPDATE characters SET cover_id=NULL WHERE EXISTS (
  SELECT 1 FROM character_cover_frames f WHERE f.character_id=characters.id AND f.media_id=characters.cover_id
);
DROP TABLE IF EXISTS character_cover_frames;
