/**
 * Isolation rules of the mobile E2E specs (same rules as scripts/lib/mobile-e2e-guard.mjs, which
 * the harness applies before it starts anything): the specs only ever talk to the isolated API
 * on :8090 using the database orenjitrade_mobile_e2e, and only ever delete the Auth emulator
 * accounts of their own run.
 */
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8090';
export const AUTH_EMULATOR_URL = process.env.E2E_AUTH_EMULATOR_URL ?? 'http://localhost:9099';
export const FIREBASE_PROJECT_ID = process.env.E2E_FIREBASE_PROJECT_ID ?? 'orenjitrade-local';
export const MOBILE_E2E_DB = 'orenjitrade_mobile_e2e';
export const DEV_API_PORT = 8080;
export const INFO_KEY = 'orenjiMobileE2e';
/** Domain of every account the mobile suites create (not the web suite's `example.test`). */
export const EMAIL_DOMAIN = 'mobile-e2e.test';

export async function readJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * Null when `info` (the /actuator/info body of `url`, null when unreachable) identifies the
 * isolated mobile E2E API; 'unreachable' when there is no answer; otherwise the refusal reason.
 */
export function isolationRefusal(url: string, info: unknown): string | null {
  if (Number(new URL(url).port || 80) === DEV_API_PORT) {
    return (
      `${url} is the developer API (port ${DEV_API_PORT}, database orenjitrade); the mobile specs only ` +
      'run against the isolated API that `npm run test:mobile:e2e` starts on :8090.'
    );
  }
  if (info === null || typeof info !== 'object') {
    return 'unreachable';
  }
  const identity = (info as Record<string, { database?: string } | undefined>)[INFO_KEY];
  if (!identity) {
    return `the API on ${url} was not started by the mobile E2E harness (no ${INFO_KEY} block in /actuator/info); refusing to write into its database.`;
  }
  if (identity.database !== MOBILE_E2E_DB) {
    return `the API on ${url} uses the database ${identity.database}, not ${MOBILE_E2E_DB}; refusing to run.`;
  }
  return null;
}

/** True only for an account of the run `runId` (`m-<run id>-...@mobile-e2e.test`). */
export function isRunAccount(email: string | undefined, runId: string): boolean {
  const value = (email ?? '').toLowerCase();
  return value.startsWith(`m-${runId}-`) && value.endsWith(`@${EMAIL_DOMAIN}`);
}

interface EmulatorUsersPage {
  users?: { localId: string; email?: string }[];
  nextPageToken?: string;
}

/** Deletes the emulator accounts of the run `runId` and nothing else; returns how many. */
export async function deleteRunAccounts(runId: string): Promise<number> {
  const base = `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}`;
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({
      maxResults: '1000',
      ...(pageToken ? { nextPageToken: pageToken } : {}),
    });
    const response = await fetch(`${base}/accounts:batchGet?${query}`, { headers });
    if (!response.ok) {
      throw new Error(`listing emulator accounts failed: HTTP ${response.status}`);
    }
    const page = (await response.json()) as EmulatorUsersPage;
    ids.push(
      ...(page.users ?? []).filter((user) => isRunAccount(user.email, runId)).map((u) => u.localId)
    );
    pageToken = page.nextPageToken;
  } while (pageToken);
  for (let i = 0; i < ids.length; i += 500) {
    const response = await fetch(`${base}/accounts:batchDelete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ localIds: ids.slice(i, i + 500), force: true }),
    });
    if (!response.ok) {
      throw new Error(`deleting emulator accounts failed: HTTP ${response.status}`);
    }
  }
  return ids.length;
}
