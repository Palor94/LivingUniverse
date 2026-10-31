-- Export a backup before rollback: these two profile fields will be removed.
ALTER TABLE characters DROP COLUMN speech_style;
ALTER TABLE characters DROP COLUMN sexuality;
