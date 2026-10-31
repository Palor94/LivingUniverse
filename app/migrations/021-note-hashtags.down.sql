-- First roll back desired extraction runs via the application, then export.
-- Keep all media_tags, including accepted extracted labels, and all original data.
DROP TABLE IF EXISTS note_tag_proposal_changes;
DROP TABLE IF EXISTS note_tag_links;
DROP TABLE IF EXISTS note_tag_proposals;
DROP TABLE IF EXISTS note_tag_runs;
DROP TABLE IF EXISTS tag_aliases;
DROP TABLE IF EXISTS tag_localizations;
