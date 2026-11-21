-- 0001_init: trips table with all constraints and indexes.
-- Must match prisma/schema.prisma (checked with `prisma migrate diff`). The CHECK
-- constraints are SQL-only: Prisma's schema language cannot express them.

-- Only these 5 values are allowed for status (enforced by the database itself).
CREATE TYPE trip_status AS ENUM ('CREATED', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

CREATE TABLE trips (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_number      VARCHAR(50)  NOT NULL,
  source           VARCHAR(255) NOT NULL,
  destination      VARCHAR(255) NOT NULL,
  driver_name      VARCHAR(100),
  status           trip_status  NOT NULL DEFAULT 'CREATED',
  idempotency_key  VARCHAR(255),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Requirement: Trip Number must be unique (the DB is the final guard, even under races).
  CONSTRAINT trips_trip_number_unique UNIQUE (trip_number),

  -- Duplicate-POST protection: one Idempotency-Key can only ever create one trip.
  CONSTRAINT trips_idempotency_key_unique UNIQUE (idempotency_key),

  -- Basic data sanity checks.
  CONSTRAINT trips_trip_number_not_blank CHECK (length(btrim(trip_number)) > 0),
  CONSTRAINT trips_source_not_blank      CHECK (length(btrim(source)) > 0),
  CONSTRAINT trips_destination_not_blank CHECK (length(btrim(destination)) > 0),
  CONSTRAINT trips_source_ne_destination CHECK (lower(source) <> lower(destination)),

  -- A trip that is ASSIGNED / IN_TRANSIT / COMPLETED must have a driver.
  CONSTRAINT trips_driver_required CHECK (
    status IN ('CREATED', 'CANCELLED') OR driver_name IS NOT NULL
  )
);

-- Speeds up "GET /trips?status=X" (filter + newest-first sort in one index).
CREATE INDEX idx_trips_status_created_at ON trips (status, created_at DESC);

-- Speeds up "GET /trips" without a filter (newest-first sort).
CREATE INDEX idx_trips_created_at ON trips (created_at DESC);
