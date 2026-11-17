CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY,
 email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 display_name TEXT NOT NULL,
 created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS journeys (
 id UUID PRIMARY KEY,
 user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL DEFAULT 'My journey',
 started_at TIMESTAMPTZ DEFAULT now(),
 ended_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS location_points (
 id BIGSERIAL PRIMARY KEY,
 journey_id UUID REFERENCES journeys(id) ON DELETE CASCADE,
 user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 position GEOGRAPHY(POINT,4326) NOT NULL,
 accuracy DOUBLE PRECISION,
 speed DOUBLE PRECISION,
 heading DOUBLE PRECISION,
 recorded_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS location_points_position_idx ON location_points USING GIST(position);
CREATE TABLE IF NOT EXISTS share_rooms (
 code TEXT PRIMARY KEY,
 owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS room_members (
 room_code TEXT REFERENCES share_rooms(code) ON DELETE CASCADE,
 user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 joined_at TIMESTAMPTZ DEFAULT now(),
 PRIMARY KEY(room_code,user_id)
);
