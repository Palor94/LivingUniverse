-- Secondary named locations. The existing media_locations row stays primary.
CREATE TABLE IF NOT EXISTS media_location_links(
  media_id TEXT NOT NULL REFERENCES media(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  PRIMARY KEY(media_id,location_id)
);
CREATE INDEX IF NOT EXISTS media_location_links_location ON media_location_links(location_id);
