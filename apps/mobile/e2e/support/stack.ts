import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';

import { API_URL, AUTH_EMULATOR_URL, EMAIL_DOMAIN, FIREBASE_PROJECT_ID } from './isolation';

export { API_URL, AUTH_EMULATOR_URL, FIREBASE_PROJECT_ID };

/*
 * Helpers for the mobile web E2E specs, which run against the REAL local stack started by
 * `npm run test:mobile:e2e`: the isolated API (:8090, database orenjitrade_mobile_e2e), the
 * shared Firebase Auth emulator (:9099) and the Expo web build (:19006). Every account created
 * here is fictional, named `m-<run id>-...@mobile-e2e.test`, lives only in the local emulator and
 * the isolated database, and is deleted from the emulator at the end of the run
 * (global-teardown.ts). Seed accounts are only ever signed in to (never modified in the emulator,
 * which the developer shares).
 */

/** Run id of this Playwright run (set by playwright.config.ts or the harness). */
export const RUN_ID = process.env.E2E_RUN_ID ?? 'rlocal00';
/** The emulator accepts any API key; this is the public local value. */
export const FIREBASE_API_KEY = 'demo-local-key';
/** Seed password (docs/development/test-accounts.md); local emulator only. */
export const SEED_PASSWORD = 'LocalDev!2026';
/** Password of accounts created by the specs (fictional, local emulator only). */
export const TEST_PASSWORD = 'E2e-Mobile-Pass!42';

const IDENTITY = `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1`;

/**
 * Every test of the file needs the stack. `npm run test:mobile:e2e` sets E2E_REQUIRE_STACK=1, so
 * an unreachable stack fails the run instead of skipping it.
 */
export function requireStack(): void {
  let reason = '';
  test.beforeAll(async () => {
    const context = await playwrightRequest.newContext();
    try {
      const health = await context.get(`${API_URL}/actuator/health/readiness`, { timeout: 5000 });
      if (!health.ok()) {
        reason = `API at ${API_URL} is not ready (HTTP ${health.status()})`;
      }
      const emulator = await context.get(`${AUTH_EMULATOR_URL}/`, { timeout: 5000 });
      if (emulator.status() >= 500) {
        reason = `Auth emulator at ${AUTH_EMULATOR_URL} is failing`;
      }
    } catch (error) {
      reason = `Local stack unreachable: ${String(error).split('\n')[0]}`;
    } finally {
      await context.dispose();
    }
    if (reason && process.env.E2E_REQUIRE_STACK === '1') {
      throw new Error(`[mobile-e2e] the stack is down: ${reason}`);
    }
  });
  test.beforeEach(() => {
    test.skip(!!reason, reason);
  });
}

function suffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`;
}

/** A unique fictional email of this run (`m-<run id>-<prefix>-<suffix>@mobile-e2e.test`). */
export function uniqueEmail(prefix: string): string {
  return `m-${RUN_ID}-${prefix}-${suffix()}@${EMAIL_DOMAIN}`;
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
  password = TEST_PASSWORD
): Promise<EmulatorUser> {
  const response = await api.post(`${IDENTITY}/accounts:signUp?key=${FIREBASE_API_KEY}`, {
    data: { email, password, returnSecureToken: true },
  });
  expect(response.ok(), `emulator sign-up of ${email}`).toBeTruthy();
  const body = (await response.json()) as { localId: string; idToken: string };
  return { email, password, uid: body.localId, idToken: body.idToken };
}

/** A fresh ID token for an existing emulator account (e.g. after the API revoked its sessions). */
export async function emulatorSignIn(
  api: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  const response = await api.post(
    `${IDENTITY}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      data: { email, password, returnSecureToken: true },
    }
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
          `${AUTH_EMULATOR_URL}/emulator/v1/projects/${FIREBASE_PROJECT_ID}/oobCodes`
        );
        const body = (await response.json()) as {
          oobCodes?: { email: string; requestType: string; oobCode: string }[];
        };
        oobCode = (body.oobCodes ?? [])
          .filter((code) => code.email === email && code.requestType === 'VERIFY_EMAIL')
          .at(-1)?.oobCode;
        return oobCode;
      },
      { message: `verification code for ${email}`, timeout: 15_000 }
    )
    .toBeTruthy();
  const response = await api.post(`${IDENTITY}/accounts:update?key=${FIREBASE_API_KEY}`, {
    data: { oobCode },
  });
  expect(response.ok(), 'apply the verification code').toBeTruthy();
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Accepts every document still required for the account (`GET /me` provisions it). */
export async function apiAcceptConsents(api: APIRequestContext, token: string): Promise<void> {
  const me = await api.get(`${API_URL}/api/v1/me`, { headers: authHeader(token) });
  expect(me.ok(), 'GET /me').toBeTruthy();
  const body = (await me.json()) as {
    requiredConsents: { documentType: string; version: string }[];
  };
  for (const consent of body.requiredConsents) {
    const response = await api.post(`${API_URL}/api/v1/me/consents`, {
      headers: authHeader(token),
      data: consent,
    });
    expect(response.status(), `consent ${consent.documentType}`).toBe(204);
  }
}

export interface OnboardedCollector extends EmulatorUser {
  handle: string;
  displayName: string;
}

/**
 * A fresh collector created through the emulator + API: accepted terms, a saved profile with a
 * game (onboarding complete), no trading area, not discoverable.
 */
export async function createOnboardedCollector(
  api: APIRequestContext,
  prefix: string,
  displayName = `Mobile ${prefix} collector`
): Promise<OnboardedCollector> {
  const user = await emulatorSignUp(api, uniqueEmail(prefix));
  await apiAcceptConsents(api, user.idToken);
  const handle = uniqueHandle(prefix);
  const profile = await api.put(`${API_URL}/api/v1/me/profile`, {
    headers: authHeader(user.idToken),
    data: {
      handle,
      displayName,
      bio: 'Fictional mobile E2E collector.',
      games: ['pokemon'],
      languages: ['en'],
    },
  });
  expect(profile.ok(), 'PUT /me/profile').toBeTruthy();
  return { ...user, handle, displayName };
}

/** Signs in through the app's sign-in screen and waits until the app left it. */
export async function signInThroughUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/sign-in');
  const form = screen(page, 'sign-in');
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Password', { exact: true }).fill(password);
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('screen-sign-in')).toBeHidden({ timeout: 30_000 });
}

/**
 * The screen with this id (`testID="screen-<id>"`). On web the stack keeps earlier screens in the
 * DOM (hidden), so specs scope their locators to the screen they act on.
 */
export function screen(page: Page, id: string): Locator {
  return page.getByTestId(`screen-${id}`).filter({ visible: true });
}

/** Opens a bottom tab by its accessible name. */
export async function openTab(page: Page, title: string): Promise<void> {
  await page
    .getByRole('tab', { name: `${title} tab` })
    .filter({ visible: true })
    .first()
    .click();
}

/** The app-wide snackbar (one message at a time). */
export function snackbar(page: Page): Locator {
  return page.getByTestId('snackbar');
}

/**
 * Opens an app path inside the running app (client-side, like a tapped link). The static web
 * export served by `expo serve` has no rewrites for dynamic routes (`/cards/<id>`,
 * `/binders/<id>` answer 404 on a full page load), so specs reach them the way the app does:
 * a history entry that expo-router's linking picks up.
 */
export async function openInApp(page: Page, path: string): Promise<void> {
  // Any rendered screen means expo-router is mounted and listening to the history.
  await expect(page.locator('[data-testid^="screen-"]').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate((target) => {
    window.history.pushState(null, '', target);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, '\?')}$`));
}
