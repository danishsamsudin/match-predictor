-- GLPM venues with WGS84 coordinates for Open-Meteo / kickoff weather.
-- Canonical IDs are SportMonks venue ids (glpm_matches.venue_sm_id / payload.venue.id).

CREATE TABLE IF NOT EXISTS glpm_venues (
  sm_id bigint PRIMARY KEY,
  name text NOT NULL,
  city_name text,
  country_id bigint,
  country_name text,
  address text,
  capacity int,
  latitude numeric(10, 7) NOT NULL,
  longitude numeric(10, 7) NOT NULL,
  altitude_m numeric(8, 2),
  image_path text,
  source text NOT NULL DEFAULT 'sportmonks',
  source_notes text,
  payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_glpm_venues_city ON glpm_venues (city_name);
CREATE INDEX IF NOT EXISTS idx_glpm_venues_coords ON glpm_venues (latitude, longitude);

COMMENT ON TABLE glpm_venues IS
  'Stadium locations (SportMonks venue ids) with WGS84 lat/lng for Open-Meteo weather.';

COMMENT ON COLUMN glpm_venues.source IS
  'Coordinate provenance: sportmonks | wikipedia | openstreetmap | manual';
