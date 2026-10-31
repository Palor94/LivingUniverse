-- Back up the catalogue and revert the race-aware application before rollback.
ALTER TABLE characters DROP COLUMN race;
