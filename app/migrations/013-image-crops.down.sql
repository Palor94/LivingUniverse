-- Revert application code first. Back up this journal and image-originals before
-- removing it: dropping the table never restores or removes image files.
DROP TABLE IF EXISTS media_image_edits;
