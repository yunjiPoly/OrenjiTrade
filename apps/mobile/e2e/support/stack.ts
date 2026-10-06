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

/** Marks an emulator account's e-mail as verified: a verification code requested, then applied. */
export async function emulatorVerifyEmail(api: APIRequestContext, user: EmulatorUser): Promise<void> {
  const response = await api.post(`${IDENTITY}/accounts:sendOobCode?key=${FIREBASE_API_KEY}`, {
    data: { requestType: 'VERIFY_EMAIL', idToken: user.idToken },
  });
  expect(response.ok(), `emulator sendOobCode for ${user.email}`).toBeTruthy();
  await verifyEmailInEmulator(api, user.email);
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
  /** Account id (`GET /me`), e.g. a recipient of `POST /conversations`. */
  id: string;
  handle: string;
  displayName: string;
}

/** A trading-area centre (3 decimals, like every manual centre). */
export interface AreaPoint {
  lat: number;
  lng: number;
  radiusKm?: number;
}

/**
 * A fresh collector created through the emulator + API: accepted terms, a saved profile with a
 * game (onboarding complete); without `area` no trading area and not discoverable, with `area` a
 * MANUAL trading area there and, with `discoverable`, on the map.
 */
export async function createOnboardedCollector(
  api: APIRequestContext,
  prefix: string,
  displayName = `Mobile ${prefix} collector`,
  options: { area?: AreaPoint; discoverable?: boolean } = {}
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
  if (options.area) {
    const area = await api.put(`${API_URL}/api/v1/me/location/trading-area`, {
      headers: authHeader(user.idToken),
      data: {
        lat: options.area.lat,
        lng: options.area.lng,
        radiusKm: options.area.radiusKm ?? 5,
        source: 'MANUAL',
      },
    });
    expect(area.ok(), 'PUT /me/location/trading-area').toBeTruthy();
  }
  if (options.discoverable) {
    await apiUpdatePrivacy(api, user.idToken, { discoverable: true });
  }
  const me = await api.get(`${API_URL}/api/v1/me`, { headers: authHeader(user.idToken) });
  expect(me.ok(), 'GET /me').toBeTruthy();
  const id = ((await me.json()) as { id: string }).id;
  return { ...user, id, handle, displayName };
}

/** Merges `changes` into the collector's privacy settings. */
export async function apiUpdatePrivacy(
  api: APIRequestContext,
  token: string,
  changes: Record<string, unknown>
): Promise<void> {
  const current = await api.get(`${API_URL}/api/v1/me/settings/privacy`, {
    headers: authHeader(token),
  });
  expect(current.ok(), 'GET privacy settings').toBeTruthy();
  const response = await api.put(`${API_URL}/api/v1/me/settings/privacy`, {
    headers: authHeader(token),
    data: { ...((await current.json()) as Record<string, unknown>), ...changes },
  });
  expect(response.ok(), 'PUT privacy settings').toBeTruthy();
}

/** `POST /conversations` as `from`: the conversation id (200 existing, 201 new). */
export async function apiStartConversation(
  api: APIRequestContext,
  from: EmulatorUser,
  recipientId: string
): Promise<string> {
  const response = await api.post(`${API_URL}/api/v1/conversations`, {
    headers: authHeader(from.idToken),
    data: { recipientId },
  });
  expect([200, 201], 'POST /conversations').toContain(response.status());
  return ((await response.json()) as { id: string }).id;
}

/** A text message as `from` (the second user of two-user specs). Returns the HTTP status. */
export async function apiSendText(
  api: APIRequestContext,
  from: EmulatorUser,
  conversationId: string,
  body: string
): Promise<number> {
  const response = await api.post(`${API_URL}/api/v1/conversations/${conversationId}/messages`, {
    headers: authHeader(from.idToken),
    data: { kind: 'TEXT', body },
  });
  return response.status();
}

export interface ApiMessage {
  id: string;
  kind: string;
  body: string;
  senderId: string | null;
  readByOther: boolean;
  payload?: { card?: { name: string }; binder?: { name: string }; image?: { url: string } };
}

/** The newest messages of a conversation as `as` sees them. */
export async function apiMessages(
  api: APIRequestContext,
  as: EmulatorUser,
  conversationId: string
): Promise<ApiMessage[]> {
  const response = await api.get(
    `${API_URL}/api/v1/conversations/${conversationId}/messages?limit=30`,
    { headers: authHeader(as.idToken) }
  );
  expect(response.ok(), 'GET messages').toBeTruthy();
  return ((await response.json()) as { items: ApiMessage[] }).items;
}

/** `as` read the conversation up to `messageId` (a read receipt for the other participant). */
export async function apiMarkRead(
  api: APIRequestContext,
  as: EmulatorUser,
  conversationId: string,
  messageId: string
): Promise<void> {
  const response = await api.post(`${API_URL}/api/v1/conversations/${conversationId}/read`, {
    headers: authHeader(as.idToken),
    data: { lastReadMessageId: messageId },
  });
  expect(response.status(), 'POST read').toBe(204);
}

/** Printing id of a seed catalog printing code (`PFT-002`), via `GET /cards/suggest`. */
export async function printingIdOf(
  api: APIRequestContext,
  token: string,
  code: string
): Promise<string> {
  const response = await api.get(`${API_URL}/api/v1/cards/suggest`, {
    headers: authHeader(token),
    params: { q: code, limit: 10 },
  });
  expect(response.ok(), `suggest ${code}`).toBeTruthy();
  const suggestions = (await response.json()) as {
    kind: string;
    printingId?: string;
    printingCode?: string;
  }[];
  const match = suggestions.find(
    (suggestion) => suggestion.kind === 'PRINTING' && suggestion.printingCode === code
  );
  expect(match?.printingId, `printing ${code} in the seed catalog`).toBeTruthy();
  return match!.printingId!;
}

/** A public binder of `holder` (published until disabled). */
export async function apiPublicBinder(
  api: APIRequestContext,
  holder: EmulatorUser,
  name: string
): Promise<string> {
  const created = await api.post(`${API_URL}/api/v1/binders`, {
    headers: authHeader(holder.idToken),
    data: { name, kind: 'TRADE', description: 'Fictional binder of the mobile E2E suite.' },
  });
  expect(created.ok(), 'POST /binders').toBeTruthy();
  const id = ((await created.json()) as { id: string }).id;
  const published = await api.post(`${API_URL}/api/v1/binders/${id}/publish`, {
    headers: authHeader(holder.idToken),
    data: { mode: 'UNTIL_DISABLED' },
  });
  expect(published.ok(), 'publish binder').toBeTruthy();
  return id;
}

/** One public copy of a printing in a public binder (publication → wishlist matching). */
export async function apiListCopy(
  api: APIRequestContext,
  holder: EmulatorUser,
  binderId: string,
  printingId: string,
  askingPrice: number
): Promise<void> {
  const response = await api.post(`${API_URL}/api/v1/inventory/items`, {
    headers: authHeader(holder.idToken),
    data: {
      printingId,
      binderId,
      condition: 'NEAR_MINT',
      availability: 'TRADE_OR_SALE',
      askingPrice,
      currency: 'CAD',
      acceptsOffers: false,
      publicNotes: 'Fictional listing of the mobile E2E suite.',
    },
  });
  expect(response.status(), 'POST /inventory/items').toBe(201);
}

/** A public card of `holder` in a public binder, with its options; returns the new item. */
export async function apiListItem(
  api: APIRequestContext,
  holder: EmulatorUser,
  binderId: string,
  printingId: string,
  options: Record<string, unknown> = {}
): Promise<{ id: string; card: { id: string; name: string } }> {
  const response = await api.post(`${API_URL}/api/v1/inventory/items`, {
    headers: authHeader(holder.idToken),
    data: {
      printingId,
      binderId,
      condition: 'NEAR_MINT',
      currency: 'CAD',
      publicNotes: 'Fictional listing of the mobile E2E suite.',
      ...options,
    },
  });
  expect(response.status(), 'POST /inventory/items').toBe(201);
  return (await response.json()) as { id: string; card: { id: string; name: string } };
}

export interface ApiOffer {
  id: string;
  status: string;
  version: number;
  latestOfferId: string;
  tradeId?: string | null;
  cashAmount?: number | null;
}

/** `GET /offers/{id}` as `as`. */
export async function apiOffer(
  api: APIRequestContext,
  as: EmulatorUser,
  offerId: string
): Promise<ApiOffer> {
  const response = await api.get(`${API_URL}/api/v1/offers/${offerId}`, {
    headers: authHeader(as.idToken),
  });
  expect(response.ok(), 'GET /offers/{id}').toBeTruthy();
  return (await response.json()) as ApiOffer;
}

/** A cash offer by `buyer` on a public item (the second user of two-user specs). */
export async function apiMakeOffer(
  api: APIRequestContext,
  buyer: EmulatorUser,
  itemId: string,
  cashAmount: number,
  message?: string
): Promise<ApiOffer> {
  const response = await api.post(`${API_URL}/api/v1/offers`, {
    headers: authHeader(buyer.idToken),
    data: { itemId, kind: 'CASH', cashAmount, currency: 'CAD', ...(message ? { message } : {}) },
  });
  expect(response.status(), 'POST /offers').toBe(201);
  return (await response.json()) as ApiOffer;
}

/** A cash counter-offer by `as` on the live proposal `offerId` (its current version). */
export async function apiCounterOffer(
  api: APIRequestContext,
  as: EmulatorUser,
  offerId: string,
  cashAmount: number
): Promise<ApiOffer> {
  const current = await apiOffer(api, as, offerId);
  const response = await api.post(`${API_URL}/api/v1/offers/${offerId}/counter`, {
    headers: authHeader(as.idToken),
    data: {
      kind: 'CASH',
      cashAmount,
      currency: 'CAD',
      tradeItemIds: [],
      version: current.version,
    },
  });
  expect(response.status(), 'POST /offers/{id}/counter').toBe(200);
  return (await response.json()) as ApiOffer;
}

/** `as` declines the live proposal `offerId` with a reason. */
export async function apiDeclineOffer(
  api: APIRequestContext,
  as: EmulatorUser,
  offerId: string,
  reason: string
): Promise<void> {
  const current = await apiOffer(api, as, offerId);
  const response = await api.post(`${API_URL}/api/v1/offers/${offerId}/decline`, {
    headers: authHeader(as.idToken),
    data: { reason, version: current.version },
  });
  expect(response.status(), 'POST /offers/{id}/decline').toBe(200);
}

/** `as` confirms the exchange of a trade (both confirmations complete it). */
export async function apiCompleteTrade(
  api: APIRequestContext,
  as: EmulatorUser,
  tradeId: string
): Promise<{ status: string }> {
  const response = await api.post(`${API_URL}/api/v1/trades/${tradeId}/complete`, {
    headers: authHeader(as.idToken),
  });
  expect(response.status(), 'POST /trades/{id}/complete').toBe(200);
  return (await response.json()) as { status: string };
}

/** The ratings of a collector as `as` sees them. */
export async function apiCollectorRatings(
  api: APIRequestContext,
  as: EmulatorUser,
  handle: string
): Promise<{ items: { rater: { handle: string }; overall: number; comment?: string | null }[] }> {
  const response = await api.get(`${API_URL}/api/v1/collectors/${handle}/ratings`, {
    headers: authHeader(as.idToken),
  });
  expect(response.ok(), 'GET /collectors/{handle}/ratings').toBeTruthy();
  return (await response.json()) as {
    items: { rater: { handle: string }; overall: number; comment?: string | null }[];
  };
}

/** `as`'s own reports (`GET /me/reports`). */
export async function apiMyReports(
  api: APIRequestContext,
  as: EmulatorUser
): Promise<{ status: string; reason: string; reportedUser: { handle: string } }[]> {
  const response = await api.get(`${API_URL}/api/v1/me/reports`, {
    headers: authHeader(as.idToken),
  });
  expect(response.ok(), 'GET /me/reports').toBeTruthy();
  return (await response.json()) as {
    status: string;
    reason: string;
    reportedUser: { handle: string };
  }[];
}

/**
 * A random public point of rural Québec with 3 decimals (a region no other spec uses), so
 * parallel specs and earlier runs never match each other's listings.
 */
export function randomRuralArea(): AreaPoint {
  const pick = (min: number, span: number) => {
    const value = Math.round((min + Math.random() * span) * 1000);
    return (value % 10 === 0 ? value + 3 : value) / 1000;
  };
  return { lat: pick(47.1, 1.3), lng: pick(-78.8, 7.8) };
}

/** A point about 1.5 km from `area`. */
export function nearArea(area: AreaPoint): AreaPoint {
  return {
    lat: Math.round((area.lat + 0.011) * 1000) / 1000,
    lng: Math.round((area.lng - 0.014) * 1000) / 1000,
  };
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
  await expect(
    page.locator('[data-testid^="screen-"]').filter({ visible: true }).first()
  ).toBeVisible({
    timeout: 30_000,
  });
  await page.evaluate((target) => {
    window.history.pushState(null, '', target);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  }, path);
  // The whole path, query string included, taken literally.
  const literal = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(page).toHaveURL(new RegExp(`${literal}$`));
}

/** The card and printing ids of a seed printing code (`PFT-002`), via `GET /cards/suggest`. */
export async function cardOfPrinting(
  api: APIRequestContext,
  token: string,
  code: string
): Promise<{ cardId: string; printingId: string; cardName: string }> {
  const response = await api.get(`${API_URL}/api/v1/cards/suggest`, {
    headers: authHeader(token),
    params: { q: code, limit: 10 },
  });
  expect(response.ok(), `suggest ${code}`).toBeTruthy();
  const suggestions = (await response.json()) as {
    kind: string;
    id: string;
    name: string;
    printingId?: string;
    printingCode?: string;
  }[];
  const match = suggestions.find(
    (suggestion) => suggestion.kind === 'PRINTING' && suggestion.printingCode === code
  );
  expect(match?.printingId, `printing ${code} in the seed catalog`).toBeTruthy();
  return { cardId: match!.id, printingId: match!.printingId!, cardName: match!.name };
}

/** A wish of `as` for a card (any printing), through the API (`POST /wishlist`). */
export async function apiAddWish(
  api: APIRequestContext,
  as: EmulatorUser,
  cardId: string,
  extra: Record<string, unknown> = {}
): Promise<{ id: string }> {
  const response = await api.post(`${API_URL}/api/v1/wishlist`, {
    headers: authHeader(as.idToken),
    data: { cardId, conditionMin: 'LIGHTLY_PLAYED', radiusKm: 10, tradePreference: 'ANY', ...extra },
  });
  expect(response.status(), 'POST /wishlist').toBe(201);
  return (await response.json()) as { id: string };
}

/** The collectors `as` blocked (`GET /me/blocks`). */
export async function apiMyBlocks(
  api: APIRequestContext,
  as: EmulatorUser
): Promise<{ id: string; handle: string }[]> {
  const response = await api.get(`${API_URL}/api/v1/me/blocks`, {
    headers: authHeader(as.idToken),
  });
  expect(response.ok(), 'GET /me/blocks').toBeTruthy();
  return (await response.json()) as { id: string; handle: string }[];
}

/** One inventory item of `as` as the API holds it (`GET /inventory/items/{id}`). */
export async function apiInventoryItem(
  api: APIRequestContext,
  as: EmulatorUser,
  itemId: string
): Promise<{ id: string; visibility: string; images: { id: string; url: string }[] }> {
  const response = await api.get(`${API_URL}/api/v1/inventory/items/${itemId}`, {
    headers: authHeader(as.idToken),
  });
  expect(response.ok(), 'GET /inventory/items/{id}').toBeTruthy();
  return (await response.json()) as {
    id: string;
    visibility: string;
    images: { id: string; url: string }[];
  };
}

/** An emulator account's sign-in providers (`google.com`, `password`), by e-mail; null when absent. */
export async function emulatorProvidersOf(
  api: APIRequestContext,
  email: string
): Promise<{ providers: string[]; displayName: string | null; emailVerified: boolean } | null> {
  const base = `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}`;
  let pageToken: string | undefined;
  do {
    const response = await api.get(`${base}/accounts:batchGet`, {
      headers: { Authorization: 'Bearer owner' },
      params: { maxResults: 1000, ...(pageToken ? { nextPageToken: pageToken } : {}) },
    });
    expect(response.ok(), 'emulator accounts:batchGet').toBeTruthy();
    const body = (await response.json()) as {
      users?: {
        email?: string;
        displayName?: string;
        emailVerified?: boolean;
        providerUserInfo?: { providerId: string }[];
      }[];
      nextPageToken?: string;
    };
    const user = (body.users ?? []).find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase()
    );
    if (user) {
      return {
        providers: (user.providerUserInfo ?? []).map((info) => info.providerId),
        displayName: user.displayName ?? null,
        emailVerified: user.emailVerified ?? false,
      };
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return null;
}

/** A copy of a printing outside any binder (private by default), with its options. */
export async function apiAddItem(
  api: APIRequestContext,
  owner: EmulatorUser,
  printingId: string,
  options: Record<string, unknown> = {}
): Promise<{ id: string; card: { id: string; name: string } }> {
  const response = await api.post(`${API_URL}/api/v1/inventory/items`, {
    headers: authHeader(owner.idToken),
    data: { printingId, condition: 'NEAR_MINT', currency: 'CAD', ...options },
  });
  expect(response.status(), 'POST /inventory/items').toBe(201);
  return (await response.json()) as { id: string; card: { id: string; name: string } };
}

/** A 2×2 PNG standing in for a photo from the library (the API re-encodes it). */
export const PHOTO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
  'base64'
);
