-- Runs once on first container start. Flyway also creates these idempotently (V001),
-- so a fresh Cloud SQL instance without this script still works.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Separate database for Testcontainers-free integration runs against the local instance.
CREATE DATABASE orenjitrade_test OWNER orenjitrade;
\connect orenjitrade_test
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Database of the web E2E suite (npm run test:e2e recreates it per run and creates it itself on a
-- volume initialised before this line existed). Never the developer database orenjitrade.
CREATE DATABASE orenjitrade_e2e OWNER orenjitrade;
\connect orenjitrade_e2e
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
