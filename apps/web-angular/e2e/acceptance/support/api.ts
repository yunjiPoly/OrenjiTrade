import { APIRequestContext, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { E2E_DB, isTestDataEmail } from '../../support/isolation';
import {
  API_URL,
  AUTH_EMULATOR_URL,
  FIREBASE_API_KEY,
  FIREBASE_PROJECT_ID,
  SEED_PASSWORD,
  authHeader,
  emulatorSignIn,
  emulatorSignUp,
  uniqueEmail,
  uniqueHandle,
} from '../../support/stack';
import { Point, PrivacyScanner } from './privacy';

/**
 * API seeding shortcuts of the acceptance suite. Everything goes through the real local API with
 * fresh fictional accounts from the Firebase Auth emulator; every JSON answer is also handed to
 * the privacy scanner. The UI steps of a scenario stay in the specs; these helpers only prepare
 * the state a scenario starts from (and the two test-clock shortcuts: the deletion grace period and
 * a listing's last confirmation). Every collector created here is retired after the test (see
 * {@link AcceptanceApi.cleanUp}).
 */

/** Shared secret of `/internal/**` (the local profile default; CI passes its own value). */
export const SERVICE_TOKEN = process.env['E2E_SERVICE_TOKEN'] ?? 'local-service-token';
const DB_CONTAINER = process.env['E2E_DB_CONTAINER'] ?? 'orenjitrade-postgres';
/** The E2E database (never the developer's `orenjitrade`, see `support/isolation.ts`). */
const DB_NAME = process.env['E2E_DB_NAME'] ?? E2E_DB;
/** Upper bound of the teardown: retiring collectors must never make a test time out. */
const CLEANUP_BUDGET_MS = 20_000;
const DB_USER = process.env['E2E_DB_USER'] ?? 'orenjitrade';

export interface Collector {
  email: string;
  password: string;
  uid: string;
  idToken: string;
  id: string;
  handle: string;
  displayName: string;
  /** The stored (private) trading-area centre, when the collector has one. */
  area: Point | null;
  /** Public label derived by the server for the area. */
  areaLabel: string | null;
}

export type StaffRole = 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';

export interface CallOptions {
  token?: string;
  data?: unknown;
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
}

export interface ApiAnswer<T = unknown> {
  status: number;
  body: T;
}

/** A short random suffix for unique, human-readable fictional names. */
export function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

export class AcceptanceApi {
  private readonly promoted: Collector[] = [];
  private readonly publishedBinders: { owner: Collector; binderId: string }[] = [];
  /** Every collector this helper created during the test (retired by {@link cleanUp}). */
  private readonly created: Collector[] = [];

  constructor(
    private readonly request: APIRequestContext,
    private readonly privacy: PrivacyScanner,
  ) {}

  /** Any API call; JSON answers are scanned for coordinates. */
  async call<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: CallOptions = {},
  ): Promise<ApiAnswer<T>> {
    const url = path.startsWith('http') ? path : `${API_URL}${path}`;
    const response = await this.request.fetch(url, {
      method,
      headers: {
        ...(options.token ? authHeader(options.token) : {}),
        ...(options.headers ?? {}),
      },
      data: options.data,
      params: options.params,
    });
    const text = await response.text();
    let body: unknown = text;
    if ((response.headers()['content-type'] ?? '').includes('json') && text) {
      body = JSON.parse(text);
      this.privacy.scan(url, body);
    }
    return { status: response.status(), body: body as T };
  }

  /** A call that must succeed (2xx); returns the body. */
  async ok<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: CallOptions = {},
  ): Promise<T> {
    const answer = await this.call<T>(method, path, options);
    expect(
      answer.status,
      `${method} ${path} → ${answer.status} ${JSON.stringify(answer.body)}`,
    ).toBeLessThan(300);
    return answer.body;
  }

  /**
   * A fresh collector: emulator account, accepted terms, a profile (onboarding complete) and,
   * with `area`, a trading area whose centre is registered with the privacy scanner.
   */
  async collector(
    prefix: string,
    options: { area?: Point; radiusKm?: number; displayName?: string; discoverable?: boolean } = {},
  ): Promise<Collector> {
    const user = await emulatorSignUp(this.request, uniqueEmail(prefix));
    const me = await this.ok<{ requiredConsents: { documentType: string; version: string }[] }>(
      'GET',
      '/api/v1/me',
      { token: user.idToken },
    );
    for (const consent of me.requiredConsents) {
      await this.ok('POST', '/api/v1/me/consents', { token: user.idToken, data: consent });
    }
    // The 18+ confirmation (never required at registration, but gating discoverability,
    // messaging, community posts and offers). Read with the token: per-user rate limit, not the
    // anonymous per-IP budget shared by every worker.
    const documents = await this.ok<{ documentType: string; version: string }[]>(
      'GET',
      '/api/v1/public/legal/documents',
      { token: user.idToken },
    );
    const age = documents.find((doc) => doc.documentType === 'AGE_CONFIRMATION');
    expect(age, 'the API publishes the AGE_CONFIRMATION document').toBeTruthy();
    await this.ok('POST', '/api/v1/me/consents', {
      token: user.idToken,
      data: { documentType: 'AGE_CONFIRMATION', version: age!.version },
    });
    const handle = uniqueHandle(prefix);
    const displayName = options.displayName ?? `E2E ${prefix} ${suffix()}`;
    await this.ok('PUT', '/api/v1/me/profile', {
      token: user.idToken,
      data: {
        handle,
        displayName,
        bio: 'Fictional collector created by the acceptance suite.',
        games: ['yugioh', 'pokemon'],
        languages: ['en'],
      },
    });
    let areaLabel: string | null = null;
    if (options.area) {
      this.privacy.registerCentre(`@${handle}`, options.area);
      const saved = await this.ok<{ tradingArea?: { label?: string | null } }>(
        'PUT',
        '/api/v1/me/location/trading-area',
        {
          token: user.idToken,
          data: { ...options.area, radiusKm: options.radiusKm ?? 10, source: 'MANUAL' },
        },
      );
      areaLabel = saved.tradingArea?.label ?? null;
    }
    if (options.discoverable) {
      await this.updatePrivacy(user.idToken, { discoverable: true });
    }
    const account = await this.ok<{ id: string }>('GET', '/api/v1/me', { token: user.idToken });
    const collector: Collector = {
      ...user,
      id: account.id,
      handle,
      displayName,
      area: options.area ?? null,
      areaLabel,
    };
    this.created.push(collector);
    return collector;
  }

  /** A fresh collector promoted by the seed super admin (demoted again after the test). */
  async staff(prefix: string, roles: StaffRole[]): Promise<Collector> {
    const member = await this.collector(prefix);
    await this.setRoles(member, ['USER', ...roles]);
    this.promoted.push(member);
    return member;
  }

  /** Merges `changes` into the collector's privacy settings. */
  async updatePrivacy(token: string, changes: Record<string, unknown>): Promise<void> {
    const current = await this.ok<Record<string, unknown>>('GET', '/api/v1/me/settings/privacy', {
      token,
    });
    await this.ok('PUT', '/api/v1/me/settings/privacy', {
      token,
      data: { ...current, ...changes },
    });
  }

  /** Printing id of a seed catalog printing code (`AZR-EN011`). */
  async printingId(token: string, code: string): Promise<string> {
    const suggestions = await this.ok<
      { kind: string; printingId?: string; printingCode?: string }[]
    >('GET', '/api/v1/cards/suggest', { token, params: { q: code, limit: 10 } });
    const match = suggestions.find(
      (entry) => entry.kind === 'PRINTING' && entry.printingCode === code,
    );
    expect(match?.printingId, `printing ${code} in the seed catalog`).toBeTruthy();
    return match!.printingId!;
  }

  /** Card id of a seed catalog card by its exact name. */
  async cardId(token: string, name: string): Promise<string> {
    const suggestions = await this.ok<{ kind: string; id: string; name: string }[]>(
      'GET',
      '/api/v1/cards/suggest',
      { token, params: { q: name, limit: 10 } },
    );
    const card = suggestions.find((entry) => entry.kind === 'CARD' && entry.name === name);
    expect(card, `${name} in the seed catalog`).toBeTruthy();
    return card!.id;
  }

  async binder(
    owner: Collector,
    body: { name: string; kind?: string; description?: string },
  ): Promise<{ id: string; name: string }> {
    return this.ok('POST', '/api/v1/binders', { token: owner.idToken, data: body });
  }

  async item(
    owner: Collector,
    code: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string; card: { name: string } }> {
    return this.ok('POST', '/api/v1/inventory/items', {
      token: owner.idToken,
      data: {
        printingId: await this.printingId(owner.idToken, code),
        condition: 'NEAR_MINT',
        currency: 'CAD',
        ...extra,
      },
    });
  }

  /** Publishes a binder until disabled; it is unpublished again after the test. */
  async publish(owner: Collector, binderId: string): Promise<void> {
    await this.ok('POST', `/api/v1/binders/${binderId}/publish`, {
      token: owner.idToken,
      data: { mode: 'UNTIL_DISABLED' },
    });
    this.trackPublished(owner, binderId);
  }

  /** Remembers a binder published through the UI so the teardown unpublishes it. */
  trackPublished(owner: Collector, binderId: string): void {
    this.publishedBinders.push({ owner, binderId });
  }

  /** A discoverable collector with one published binder holding the given cards. */
  async seller(
    prefix: string,
    area: Point,
    cards: { code: string; extra?: Record<string, unknown> }[],
    options: { displayName?: string; binderName?: string } = {},
  ): Promise<{
    collector: Collector;
    binder: { id: string; name: string };
    items: { id: string; card: { name: string } }[];
  }> {
    const collector = await this.collector(prefix, {
      area,
      radiusKm: 5,
      displayName: options.displayName,
      discoverable: true,
    });
    const binder = await this.binder(collector, {
      name: options.binderName ?? `E2E acceptance binder ${suffix()}`,
      kind: 'TRADE',
      description: 'Fictional binder for the acceptance suite.',
    });
    const items = [];
    for (const card of cards) {
      items.push(
        await this.item(collector, card.code, {
          binderId: binder.id,
          availability: 'TRADE_OR_SALE',
          askingPrice: 30,
          acceptsOffers: true,
          ...(card.extra ?? {}),
        }),
      );
    }
    await this.publish(collector, binder.id);
    return { collector, binder, items };
  }

  async conversation(from: Collector, to: Collector): Promise<string> {
    const answer = await this.ok<{ id: string }>('POST', '/api/v1/conversations', {
      token: from.idToken,
      data: { recipientId: to.id },
    });
    return answer.id;
  }

  async message(from: Collector, conversationId: string, body: string): Promise<void> {
    await this.ok('POST', `/api/v1/conversations/${conversationId}/messages`, {
      token: from.idToken,
      data: { kind: 'TEXT', body },
    });
  }

  async ratingEligibility(
    from: Collector,
    to: Collector,
  ): Promise<{ eligible: boolean; interactions: { id: string; kind: string }[] }> {
    return this.ok('GET', '/api/v1/ratings/eligibility', {
      token: from.idToken,
      params: { userId: to.id },
    });
  }

  /** A conversation where both collectors sent three messages (a qualified interaction). */
  async qualifiedConversation(a: Collector, b: Collector): Promise<string> {
    const id = await this.conversation(a, b);
    const lines: [Collector, string][] = [
      [a, 'Hi! Is the Azure-Eyes in your binder still available?'],
      [b, 'Yes, near mint, 20 CAD.'],
      [a, 'Great, could we meet at the library on Saturday?'],
      [b, 'Saturday afternoon works for me.'],
      [a, 'Perfect, see you at 2 pm.'],
      [b, 'Deal, bring a sleeve!'],
    ];
    for (const [from, text] of lines) {
      await this.message(from, id, `${text} (${suffix()})`);
    }
    await expect
      .poll(async () => (await this.ratingEligibility(a, b)).eligible, {
        message: 'the qualified conversation makes the pair eligible to rate',
        timeout: 20_000,
      })
      .toBe(true);
    return id;
  }

  async notifications(
    collector: Collector,
  ): Promise<{ type: string; title?: string; body?: string; data?: Record<string, unknown> }[]> {
    const page = await this.ok<{ items: { type: string }[] }>('GET', '/api/v1/notifications', {
      token: collector.idToken,
      params: { limit: 50 },
    });
    return page.items;
  }

  /** `POST /internal/jobs/<name>` with the local service token (as Cloud Scheduler would). */
  async runJob<T = Record<string, unknown>>(name: string): Promise<T> {
    return this.ok<T>('POST', `/internal/jobs/${name}`, {
      headers: { 'X-Service-Token': SERVICE_TOKEN },
    });
  }

  /**
   * Test clock: ends the 7-day grace period of `userId`'s pending deletion request, so the
   * account-deletion job treats it as due. One of the suite's two direct database writes (local
   * docker compose PostGIS; `E2E_DB_CONTAINER` / `E2E_DB_NAME` / `E2E_DB_USER` override it).
   */
  fastForwardDeletionGracePeriod(userId: string): void {
    expect(userId, 'a user id').toMatch(/^[0-9a-f-]{36}$/);
    const output = execFileSync(
      'docker',
      [
        'exec',
        DB_CONTAINER,
        'psql',
        '-U',
        DB_USER,
        '-d',
        DB_NAME,
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        "UPDATE account_deletion_request SET scheduled_for = now() - interval '1 minute'" +
          ` WHERE user_id = '${userId}' AND status = 'PENDING'`,
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    expect(output.trim(), 'one pending deletion request moved to the past').toBe('UPDATE 1');
  }

  /**
   * Test clock: pretends the owner last confirmed `itemId` `days` days ago, so the next freshness
   * job run derives its state from the active delist policy (the suite's other direct database
   * write, same container settings as above).
   */
  backdateConfirmation(itemId: string, days: number): void {
    expect(itemId, 'an item id').toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isInteger(days) && days > 0 && days < 400, 'a whole number of days').toBe(true);
    const output = execFileSync(
      'docker',
      [
        'exec',
        DB_CONTAINER,
        'psql',
        '-U',
        DB_USER,
        '-d',
        DB_NAME,
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `UPDATE inventory_item SET confirmed_at = now() - interval '${days} days'` +
          ` WHERE id = '${itemId}' AND deleted_at IS NULL`,
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    expect(output.trim(), 'one item confirmation moved to the past').toBe('UPDATE 1');
  }

  /** The emulator's error code for a password sign-in (`null` when the sign-in succeeds). */
  async emulatorSignInError(email: string, password: string): Promise<string | null> {
    const response = await this.request.post(
      `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      { data: { email, password, returnSecureToken: true } },
    );
    if (response.ok()) {
      return null;
    }
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `HTTP ${response.status()}`;
  }

  /**
   * Teardown (never fails the test, bounded in time): takes staff roles back, unpublishes the
   * binders published for the test, then retires every collector the test created through the
   * real account-deletion path (`POST /me/deletion-requests`: off the map, public inventory hidden,
   * sessions revoked; the deletion job anonymises the account after the grace period) and deletes
   * their Auth emulator accounts. A collector whose deletion is blocked (an open trade) is at least
   * taken off the map (`discoverable: false`). Seed accounts (`@orenjitrade.test`) are never touched.
   */
  async cleanUp(): Promise<void> {
    const work = (async () => {
      for (const member of this.promoted.splice(0)) {
        await this.setRoles(member, ['USER']).catch(() => undefined);
      }
      for (const { owner, binderId } of this.publishedBinders.splice(0)) {
        await this.request
          .post(`${API_URL}/api/v1/binders/${binderId}/unpublish`, {
            headers: authHeader(owner.idToken),
          })
          .catch(() => undefined);
      }
      for (const collector of this.created.splice(0)) {
        await this.retire(collector).catch(() => undefined);
      }
    })().catch(() => undefined);
    await Promise.race([
      work,
      new Promise<void>((resolve) => setTimeout(resolve, CLEANUP_BUDGET_MS)),
    ]);
  }

  /** Requests the deletion of a test collector's account and deletes its emulator account. */
  private async retire(collector: Collector): Promise<void> {
    if (!isTestDataEmail(collector.email)) {
      return; // never a seed account or anything outside the suites' test domain
    }
    // A fresh token: the deletion request needs a sign-in within the last 5 minutes.
    const signIn = await this.request.post(
      `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        data: { email: collector.email, password: collector.password, returnSecureToken: true },
        timeout: 5_000,
      },
    );
    if (signIn.ok()) {
      const token = ((await signIn.json()) as { idToken: string }).idToken;
      const deletion = await this.request.post(`${API_URL}/api/v1/me/deletion-requests`, {
        headers: authHeader(token),
        data: { reason: 'Acceptance suite teardown (fictional test account)' },
        timeout: 10_000,
      });
      if (deletion.status() === 409) {
        const problem = (await deletion.json().catch(() => ({}))) as { errorCode?: string };
        if (problem.errorCode === 'DELETION_BLOCKED') {
          await this.hideFromMap(token);
        }
      }
    }
    await this.request.post(
      `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/accounts:batchDelete`,
      {
        headers: { Authorization: 'Bearer owner' },
        data: { localIds: [collector.uid], force: true },
        timeout: 5_000,
      },
    );
  }

  /** `discoverable: false` for a collector who cannot be deleted yet. */
  private async hideFromMap(token: string): Promise<void> {
    const current = await this.request.get(`${API_URL}/api/v1/me/settings/privacy`, {
      headers: authHeader(token),
      timeout: 5_000,
    });
    if (!current.ok()) {
      return;
    }
    await this.request.put(`${API_URL}/api/v1/me/settings/privacy`, {
      headers: authHeader(token),
      data: { ...((await current.json()) as Record<string, unknown>), discoverable: false },
      timeout: 5_000,
    });
  }

  private async setRoles(member: Collector, roles: string[]): Promise<void> {
    const superAdmin = await emulatorSignIn(
      this.request,
      'superadmin@orenjitrade.test',
      SEED_PASSWORD,
    );
    await this.ok('PUT', `/api/v1/admin/users/${member.id}/roles`, {
      token: superAdmin,
      data: { roles },
    });
  }
}
