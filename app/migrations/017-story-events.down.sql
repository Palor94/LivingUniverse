-- Export/verify a full backup, stop the app, and revert feature code first.
-- This removes ONLY event data; no profile, relationship, media or visual canon.
DROP TABLE IF EXISTS story_event_source_keys;
DROP TABLE IF EXISTS story_event_locations;
DROP TABLE IF EXISTS story_event_participants;
DROP TABLE IF EXISTS story_event_revisions;
DROP TABLE IF EXISTS story_events;
