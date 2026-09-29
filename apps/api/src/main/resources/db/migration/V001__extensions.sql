-- V001: PostgreSQL extensions and helper functions used by every later migration.
-- Idempotent on purpose: the local docker-compose init script creates the same extensions so a
-- fresh Cloud SQL instance without that script still works. Requires a role allowed to create
-- extensions (the Cloud SQL default user and the local `orenjitrade` user both are).

CREATE EXTENSION IF NOT EXISTS postgis;   -- geography(Point, 4326), ST_DWithin, GiST indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- trigram similarity for fuzzy card / collector search
CREATE EXTENSION IF NOT EXISTS unaccent;  -- accent-insensitive search (Pokémon -> Pokemon)
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid(), digest()

-- unaccent() is only STABLE because its dictionary can change, which makes it unusable in
-- generated tsvector columns and expression indexes. This wrapper pins the dictionary and is
-- declared IMMUTABLE so it can back `GENERATED ALWAYS AS (to_tsvector('simple',
-- unaccent_immutable(name))) STORED` columns and pg_trgm indexes.
CREATE OR REPLACE FUNCTION unaccent_immutable(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
    SELECT public.unaccent('public.unaccent'::regdictionary, input)
$$;

COMMENT ON FUNCTION unaccent_immutable(text) IS
    'Immutable unaccent() wrapper for generated search columns and expression indexes.';
