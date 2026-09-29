import {
  APIRequestContext,
  Page,
  expect,
  request as playwrightRequest,
  test,
} from '@playwright/test';

/**
 * Helpers for specs that run against the REAL local stack: the API (snapshot jar or bootRun on
 * :8080, profile `local`), PostGIS/Redis from docker compose and the Firebase Auth emulator.
 * Every account created here is fictional and lives only in the local emulator + database.
 */
export const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:8080';
export const AUTH_EMULATOR_URL = process.env['E2E_AUTH_EMULATOR_URL'] ?? 'http://localhost:9099';
export const FIREBASE_PROJECT_ID = process.env['E2E_FIREBASE_PROJECT_ID'] ?? 'orenjitrade-local';
/** The emulator accepts any API key; this is the value from public/config.json. */
export const FIREBASE_API_KEY = 'demo-local-key';
/** Seed password (docs/development/test-accounts.md); local emulator only. */
export const SEED_PASSWORD = 'LocalDev!2026';
/** Password of accounts created by the specs (fictional, local emulator only). */
export const TEST_PASSWORD = 'E2e-Local-Pass!42';

const IDENTITY = `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1`;

export interface StackStatus {
  ok: boolean;
  reason: string;
}

/** Checks that the API is ready and the Auth emulator answers. */
export async function checkStack(): Promise<StackStatus> {
  const context = await playwrightRequest.newContext();
  try {
    const health = await context.get(`${API_URL}/actuator/health/readiness`, { timeout: 5000 });
    if (!health.ok()) {
      return { ok: false, reason: `API at ${API_URL} is not ready (HTTP ${health.status()})` };
    }
    const emulator = await context.get(`${AUTH_EMULATOR_URL}/`, { timeout: 5000 });
    if (emulator.status() >= 500) {
      return { ok: false, reason: `Auth emulator at ${AUTH_EMULATOR_URL} is failing` };
    }
    return { ok: true, reason: '' };
  } catch (error) {
    return {
      ok: false,
      reason:
        `Local stack unreachable (API ${API_URL}, Auth emulator ${AUTH_EMULATOR_URL}): ` +
        `${String(error).split('\n')[0]}. Start docker compose and the API to run this spec.`,
    };
  } finally {
    await context.dispose();
  }
}

/** Registers the stack check: every test of the file skips (with the reason) when it is down. */
export function requireStack(): void {
  let status: StackStatus = { ok: false, reason: 'Stack check did not run' };
  test.beforeAll(async () => {
    status = await checkStack();
    if (!status.ok) {
      console.warn(`[e2e] Skipping: ${status.reason}`);
    }
  });
  test.beforeEach(() => {
    test.skip(!status.ok, status.reason);
  });
}

function suffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`;
}

/** A unique fictional email for this run. */
export function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${suffix()}@example.test`;
}

/** A unique handle matching `[a-z0-9_]{3,24}`. */
export function uniqueHandle(prefix: string): string {
  return `${prefix}_${suffix()}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}

export interface EmulatorUser {
  email: string;
  password: string;
  uid: string;
  idToken: string;
}

export async function emulatorSignUp(
  api: APIRequestContext,
  email: string,
  password = TEST_PASSWORD,
): Promise<EmulatorUser> {
  const response = await api.post(`${IDENTITY}/accounts:signUp?key=${FIREBASE_API_KEY}`, {
    data: { email, password, returnSecureToken: true },
  });
  expect(response.ok(), `emulator sign-up of ${email}`).toBeTruthy();
  const body = (await response.json()) as { localId: string; idToken: string };
  return { email, password, uid: body.localId, idToken: body.idToken };
}

export async function emulatorSignIn(
  api: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const response = await api.post(
    `${IDENTITY}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    { data: { email, password, returnSecureToken: true } },
  );
  expect(response.ok(), `emulator sign-in of ${email}`).toBeTruthy();
  return ((await response.json()) as { idToken: string }).idToken;
}

/** Applies the latest verification link the emulator generated for `email`. */
export async function verifyEmailInEmulator(api: APIRequestContext, email: string): Promise<void> {
  let oobCode: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await api.get(
          `${AUTH_EMULATOR_URL}/emulator/v1/projects/${FIREBASE_PROJECT_ID}/oobCodes`,
        );
        const body = (await response.json()) as {
          oobCodes?: { email: string; requestType: string; oobCode: string }[];
        };
        oobCode = (body.oobCodes ?? [])
          .filter((code) => code.email === email && code.requestType === 'VERIFY_EMAIL')
          .at(-1)?.oobCode;
        return oobCode;
      },
      { message: `verification code for ${email}`, timeout: 10_000 },
    )
    .toBeTruthy();
  const response = await api.post(`${IDENTITY}/accounts:update?key=${FIREBASE_API_KEY}`, {
    data: { oobCode },
  });
  expect(response.ok(), 'apply the verification code').toBeTruthy();
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** `GET /me` (provisions the account on first call). */
export async function apiMe(
  api: APIRequestContext,
  token: string,
): Promise<{
  id: string;
  handle: string;
  requiredConsents: { documentType: string; version: string }[];
}> {
  const response = await api.get(`${API_URL}/api/v1/me`, { headers: bearer(token) });
  expect(response.ok(), 'GET /me').toBeTruthy();
  return response.json();
}

/** Accepts every document still required for the account. */
export async function apiAcceptConsents(api: APIRequestContext, token: string): Promise<void> {
  const me = await apiMe(api, token);
  for (const consent of me.requiredConsents) {
    const response = await api.post(`${API_URL}/api/v1/me/consents`, {
      headers: bearer(token),
      data: consent,
    });
    expect(response.status(), `consent ${consent.documentType}`).toBe(204);
  }
}

export interface OnboardedCollector extends EmulatorUser {
  id: string;
  handle: string;
  displayName: string;
  /** Public label the server derived for the trading area (null without one). */
  areaLabel: string | null;
}

/**
 * Creates a collector through the emulator + API with accepted terms, a saved profile (so
 * onboarding is complete) and optionally a trading area around a public Montréal landmark.
 */
export async function createOnboardedCollector(
  api: APIRequestContext,
  prefix: string,
  options: { tradingArea?: boolean } = {},
): Promise<OnboardedCollector> {
  const user = await emulatorSignUp(api, uniqueEmail(prefix));
  await apiAcceptConsents(api, user.idToken);
  const handle = uniqueHandle(prefix);
  const displayName = `E2E ${prefix} collector`;
  const profile = await api.put(`${API_URL}/api/v1/me/profile`, {
    headers: bearer(user.idToken),
    data: {
      handle,
      displayName,
      bio: 'Fictional E2E collector.',
      games: ['pokemon'],
      languages: ['en'],
    },
  });
  expect(profile.ok(), 'PUT /me/profile').toBeTruthy();
  let areaLabel: string | null = null;
  if (options.tradingArea) {
    const area = await api.put(`${API_URL}/api/v1/me/location/trading-area`, {
      headers: bearer(user.idToken),
      // Place des Arts area, a public landmark in Montréal.
      data: { lat: 45.508, lng: -73.566, radiusKm: 5, source: 'MANUAL' },
    });
    expect(area.ok(), 'PUT /me/location/trading-area').toBeTruthy();
    areaLabel =
      ((await area.json()) as { tradingArea?: { label?: string } }).tradingArea?.label ?? null;
    expect(areaLabel, 'derived public label').toBeTruthy();
  }
  const me = await apiMe(api, user.idToken);
  return { ...user, id: me.id, handle, displayName, areaLabel };
}

/** Signs in through the UI and waits until the app left the sign-in page. */
export async function signInThroughUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\/sign-in/, { timeout: 20_000 });
}

/** Opens the account menu of the top bar (signed in: avatar trigger). */
export async function openAccountMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Account menu for / }).click();
}

/** Recursively yields every numeric `lat`/`lng` value in a JSON document. */
export function* coordinates(
  value: unknown,
  path = '$',
): Generator<{ path: string; value: number }> {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      yield* coordinates(value[i], `${path}[${i}]`);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (/^(lat|lng|latitude|longitude)$/i.test(key) && typeof child === 'number') {
        yield { path: childPath, value: child };
      } else {
        yield* coordinates(child, childPath);
      }
    }
  }
}

/** Number of decimals of a JSON number as serialised. */
export function decimalsOf(value: number): number {
  const text = String(value);
  if (text.includes('e')) {
    return Number.POSITIVE_INFINITY;
  }
  return text.includes('.') ? text.split('.')[1].length : 0;
}

/** A small stand-in card picture (SVG) for {@link stubCardImages}. */
const STUB_CARD_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 680"><rect width="488" height="680" rx="24" fill="#ede9fe"/></svg>';

/**
 * Serves the catalog's placeholder card pictures from memory. They are static images, but the
 * API counts every one of them against its anonymous per-IP rate limit (60/min), and a results
 * grid loads dozens: without this, parallel specs would starve each other's anonymous JSON calls.
 * Card data still comes from the real API; `catalog.spec.ts` checks one real picture separately.
 */
export async function stubCardImages(page: Page): Promise<void> {
  await page.route('**/api/v1/public/placeholder-images/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: STUB_CARD_SVG }),
  );
}

/** `Authorization` header for direct API calls. */
export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export type StaffRole = 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';

export interface StaffMember extends OnboardedCollector {
  /** Takes the staff roles back (the account stays a plain fictional collector). */
  demote(): Promise<void>;
}

/**
 * A fresh collector promoted by the seed super admin. Specs that click through the admin console
 * use their own staff account so they never share the seed accounts' per-user rate limit with
 * other specs (or with a second run in the same minute).
 */
export async function createStaffMember(
  api: APIRequestContext,
  prefix: string,
  roles: StaffRole[],
): Promise<StaffMember> {
  const member = await createOnboardedCollector(api, prefix);
  const setRoles = async (next: string[]): Promise<void> => {
    const superAdmin = await emulatorSignIn(api, 'superadmin@orenjitrade.test', SEED_PASSWORD);
    const response = await api.put(`${API_URL}/api/v1/admin/users/${member.id}/roles`, {
      headers: authHeader(superAdmin),
      data: { roles: next },
    });
    expect(response.ok(), `roles ${next.join(', ')} for ${member.handle}`).toBeTruthy();
  };
  await setRoles(['USER', ...roles]);
  return { ...member, demote: () => setRoles(['USER']) };
}
