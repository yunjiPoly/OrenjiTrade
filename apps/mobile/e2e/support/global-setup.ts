import { API_URL, AUTH_EMULATOR_URL, isolationRefusal, readJson } from './isolation';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:19006';

/** Seed accounts the specs sign in to (docs/development/test-accounts.md), emulator only. */
const SEED_ACCOUNTS = ['collector1@orenjitrade.test', 'collector2@orenjitrade.test'];
const SEED_PASSWORD = 'LocalDev!2026';
const FIREBASE_API_KEY = 'demo-local-key';

async function postJson(url: string, body: unknown, token?: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
}

/**
 * The seed collectors never confirmed being 18 or older (the seed predates the rule), so the app
 * would show them the onboarding age step on every fresh database. The specs that sign in to a
 * seed (`map`, `session`, `auth`) expect the tabs: the confirmation is recorded through the API
 * once per database here, exactly as the age step would (a consent row in the isolated database;
 * the emulator account is only signed in to, never modified). The age step itself is covered by
 * `age-confirmation.spec.ts` with an account created without the confirmation.
 */
async function confirmSeedAges(): Promise<void> {
  const identity = `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1`;
  for (const email of SEED_ACCOUNTS) {
    const signIn = await postJson(
      `${identity}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        email,
        password: SEED_PASSWORD,
        returnSecureToken: true,
      }
    );
    if (!signIn.ok) {
      throw new Error(`[mobile-e2e] emulator sign-in of ${email} failed: HTTP ${signIn.status}`);
    }
    const token = ((await signIn.json()) as { idToken: string }).idToken;
    const me = (await readJsonWith(`${API_URL}/api/v1/me`, token)) as {
      onboarding?: { ageConfirmed?: boolean };
    } | null;
    if (!me) {
      throw new Error(`[mobile-e2e] GET /me as ${email} failed.`);
    }
    if (me.onboarding?.ageConfirmed !== false) {
      continue;
    }
    const documents = (await readJsonWith(`${API_URL}/api/v1/public/legal/documents`, token)) as
      { documentType: string; version: string }[] | null;
    const age = documents?.find((document) => document.documentType === 'AGE_CONFIRMATION');
    if (!age) {
      throw new Error('[mobile-e2e] the API does not publish the AGE_CONFIRMATION document.');
    }
    const consent = await postJson(`${API_URL}/api/v1/me/consents`, age, token);
    if (consent.status !== 204) {
      throw new Error(
        `[mobile-e2e] recording the age confirmation of ${email} failed: HTTP ${consent.status}`
      );
    }
  }
}

async function readJsonWith(url: string, token: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * Refuses to run the specs against anything but the isolated mobile E2E stack: the API must be
 * the one `npm run test:mobile:e2e` started on :8090 (its /actuator/info identity block names the
 * database orenjitrade_mobile_e2e) and the web build must be the export made for that API. The
 * developer API on :8080 writes into the developer's database and is always refused. When the
 * stack is down the specs skip, unless E2E_REQUIRE_STACK=1 (the harness and CI), which fails.
 */
export default async function globalSetup(): Promise<void> {
  const info = await readJson(`${API_URL}/actuator/info`);
  const refusal = isolationRefusal(API_URL, info);
  if (refusal === 'unreachable') {
    if (process.env.E2E_REQUIRE_STACK === '1') {
      throw new Error(`[mobile-e2e] the API at ${API_URL} is unreachable.`);
    }
    return;
  }
  if (refusal) {
    throw new Error(`[mobile-e2e] ${refusal}`);
  }
  const stamp = (await readJson(`${BASE_URL}/mobile-e2e-build.json`)) as {
    apiBaseUrl?: string;
  } | null;
  if (stamp && stamp.apiBaseUrl !== API_URL) {
    throw new Error(
      `[mobile-e2e] the web build on ${BASE_URL} talks to ${stamp.apiBaseUrl}, not to ${API_URL}; refusing to run.`
    );
  }
  if (!stamp && process.env.E2E_REQUIRE_STACK === '1') {
    throw new Error(
      `[mobile-e2e] ${BASE_URL} is not the mobile E2E web build (no mobile-e2e-build.json); refusing to run.`
    );
  }
  await confirmSeedAges();
}
