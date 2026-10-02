// Minimal client of the API's internal job endpoints (/internal/jobs/**) for the local scripts
// catalog-import.mjs and card-images.mjs. Plain Node (global fetch), no dependencies.
//
// Authentication: the X-Service-Token header with SERVICE_TOKEN (environment, then the repository
// root .env, then the local default "local-service-token" that only the local/dev profiles accept).

import { URLS, fail, loadDotEnv } from './util.mjs';

/**
 * Parses `--name value` / `--name=value` options and boolean flags.
 *
 * @param {string[]} argv arguments after the script name
 * @param {{ values?: string[], flags?: string[] }} spec option names without the dashes
 */
export function parseOptions(argv, { values = [], flags = [] } = {}) {
  const options = {};
  for (const flag of flags) {
    options[flag] = false;
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      fail(`Unexpected argument "${arg}".`);
    }
    const [rawName, inline] = arg.slice(2).split(/=(.*)/s, 2);
    if (flags.includes(rawName)) {
      options[rawName] = true;
      continue;
    }
    if (!values.includes(rawName)) {
      fail(`Unknown option --${rawName}.`);
    }
    const value = inline !== undefined ? inline : argv[++i];
    if (value === undefined || value.startsWith('--')) {
      fail(`Option --${rawName} needs a value.`);
    }
    options[rawName] = value;
  }
  return options;
}

/** Base URL of the API (--api, ORENJI_API_URL, default http://localhost:8080). */
export function apiBase(options) {
  const env = { ...loadDotEnv(), ...process.env };
  return (options.api || env.ORENJI_API_URL || URLS.api).replace(/\/+$/, '');
}

function serviceToken() {
  const env = { ...loadDotEnv(), ...process.env };
  return env.SERVICE_TOKEN || 'local-service-token';
}

/** Calls an internal endpoint and returns the parsed JSON body (fails the script on errors). */
export async function internal(base, method, path, body) {
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'X-Service-Token': serviceToken(),
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    fail(
      `The API is not reachable at ${base} (${error.cause?.code || error.message}). ` +
        'Start it first: npm run api:dev (or npm run dev).',
    );
  }
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text.slice(0, 200) };
  }
  if (!response.ok) {
    const detail = json.message || json.detail || json.title || response.statusText;
    const fields = Array.isArray(json.errors)
      ? ` (${json.errors.map((e) => `${e.field}: ${e.message}`).join('; ')})`
      : '';
    fail(`${method} ${path} answered HTTP ${response.status}: ${detail}${fields}`);
  }
  return json;
}

/** Megabytes with two decimals. */
export function mb(bytes) {
  return (Number(bytes || 0) / (1024 * 1024)).toFixed(2);
}
