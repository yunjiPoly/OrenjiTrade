// The local docker compose PostgreSQL, reached with `docker exec <container> psql` (no client
// library, no host psql needed). Used by the web E2E harness (its own database orenjitrade_e2e)
// and the test-data purge. Every statement runs with ON_ERROR_STOP; values interpolated into SQL by
// the callers are validated first (UUIDs, constant patterns).

import { capture } from './util.mjs';
import { assertRecreatable } from './web-e2e-guard.mjs';

/** The compose service container (E2E_DB_CONTAINER overrides it). */
export const DB_CONTAINER = process.env.E2E_DB_CONTAINER || 'orenjitrade-postgres';
export const DB_USER = 'orenjitrade';

const EXTENSIONS = ['postgis', 'pg_trgm', 'unaccent', 'pgcrypto'];

/**
 * Runs `statements` in `database` (sent on stdin, so long id lists never hit the command-line
 * limit; each statement commits on its own, like psql -f); returns the rows the statements print
 * as arrays of strings (tab-separated, unaligned output; command tags are suppressed).
 */
export function psql(database, statements, { container = DB_CONTAINER, timeoutMs = 120_000 } = {}) {
  const list = Array.isArray(statements) ? statements : [statements];
  const script = `${list.map((statement) => statement.trim().replace(/;$/, '')).join(';\n')};\n`;
  const args = ['exec', '-i', container, 'psql', '-U', DB_USER, '-d', database, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-At', '-F', '\t', '-f', '-'];
  const result = capture('docker', args, { timeout: timeoutMs, input: script });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || result.error?.message || '').trim().split(/\r?\n/).slice(-3).join(' ');
    throw new Error(`psql on ${database} failed: ${detail}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split('\t'));
}

/** One scalar (first column of the first row), or null. */
export function scalar(database, statement, options) {
  const rows = psql(database, statement, options);
  return rows.length > 0 ? rows[0][0] : null;
}

export function databaseExists(name, options) {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`Invalid database name "${name}".`);
  }
  return scalar('postgres', `SELECT 1 FROM pg_database WHERE datname = '${name}'`, options) === '1';
}

function createWithExtensions(name, options) {
  psql('postgres', [`CREATE DATABASE ${name} OWNER ${DB_USER}`], options);
  psql(
    name,
    EXTENSIONS.map((extension) => `CREATE EXTENSION IF NOT EXISTS ${extension}`),
    options,
  );
}

/** Creates the database (with the PostGIS / trigram extensions) when it does not exist yet. */
export function ensureDatabase(name, options) {
  if (databaseExists(name, options)) {
    return false;
  }
  createWithExtensions(name, options);
  return true;
}

/**
 * Drops and recreates the E2E database (never any other: assertRecreatable). Open connections
 * of an earlier E2E API are terminated (WITH (FORCE)).
 */
export function recreateDatabase(name, options) {
  assertRecreatable(name);
  psql('postgres', [`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`], options);
  createWithExtensions(name, options);
}

/** True when the Docker CLI talks to an engine on this machine (named pipe / unix socket). */
export function dockerEngineIsLocal() {
  const { status, stdout } = capture('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  if (status !== 0) {
    return false;
  }
  const host = stdout.trim();
  return host.startsWith('npipe://') || host.startsWith('unix://');
}

/** Health of a container (`healthy`, `starting`, `unhealthy`, `none` without a check, `missing`). */
export function containerHealth(name) {
  const { status, stdout } = capture('docker', ['inspect', '--format', '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}', name]);
  if (status !== 0) {
    return 'missing';
  }
  const [running, health] = stdout.trim().split(/\s+/);
  return running === 'true' ? health : 'stopped';
}
