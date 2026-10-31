-- Stop the application, roll back desired approvals, and export first.
-- Accepted media_tags and background locations deliberately remain intact.
DROP TRIGGER IF EXISTS analysis_primary_deleted;
DROP TRIGGER IF EXISTS analysis_primary_changed;
DROP TRIGGER IF EXISTS analysis_secondary_deleted;
DROP TABLE IF EXISTS media_analysis_place_links;
DROP TABLE IF EXISTS media_analysis_tag_links;
DROP TABLE IF EXISTS media_analysis_decisions;
DROP TABLE IF EXISTS media_analysis_proposals;
DROP TABLE IF EXISTS media_analysis_items;
DROP TABLE IF EXISTS media_analysis_cache;
DROP TABLE IF EXISTS media_analysis_jobs;
DROP TABLE IF EXISTS media_analysis_schema;
