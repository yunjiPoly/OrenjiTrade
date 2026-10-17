/**
 * The offline demo build (`EXPO_PUBLIC_DEMO=1`, `.github/workflows/android-demo.yml`): no server
 * and no sign-in. Every API call is answered on the phone with the smallest valid answer of its
 * operation (`demoResponses.json`, generated from the OpenAPI document by
 * `scripts/demo-responses.mjs`), plus one collector in Quebec and one card. Writes answer like
 * the server would but keep nothing.
 */
import type { AuthPort, AuthUser } from '@/src/auth/authPort';

import generated from './demoResponses.json';

export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

type Answer = { status: number; body: unknown };

const operations = generated.operations as Record<string, Answer>;

const REGION = 'americas-north';

const card = {
  ...generated.samples.InventoryItemResponse,
  printing: {
    ...generated.samples.InventoryItemResponse.printing,
    setCode: 'LAVD',
    setName: 'Legendary Duelists',
    printingCode: 'LAVD-EN008',
    rarity: 'Ultra Rare',
    edition: '1st Edition',
    language: 'EN',
    marketPrice: null,
  },
  card: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Ash Blossom & Joyous Spring',
    game: 'yugioh',
  },
  binder: null,
  quantity: 1,
  condition: 'NEAR_MINT',
  language: 'EN',
  edition: '1st Edition',
  currency: 'CAD',
  askingPriceText: '85% TCG',
  availability: 'TRADE_OR_SALE',
  notes: '',
  publicNotes: '',
  visibility: 'PUBLIC',
  effectivePublic: true,
};

const overrides: Record<string, unknown> = {
  'GET /api/v1/me': {
    ...(operations['GET /api/v1/me']?.body as object),
    handle: 'demo',
    displayName: 'Demo collector',
    emailVerified: true,
    homeRegion: REGION,
    onboarding: {
      profileComplete: true,
      locationSet: true,
      interestsSet: true,
      ageConfirmed: true,
    },
  },
  'GET /api/v1/me/location': {
    discoverable: true,
    location: {
      regionCode: REGION,
      regionName: 'Americas (North)',
      countryCode: 'CA',
      countryName: 'Canada',
      subdivisionCode: 'CA-QC',
      subdivisionName: 'Quebec',
      label: 'Quebec, Canada',
      city: null,
      showCity: false,
    },
  },
  'GET /api/v1/regions': {
    regions: [
      {
        code: REGION,
        name: 'Americas (North)',
        isDefault: true,
        countries: [
          {
            code: 'CA',
            name: 'Canada',
            regionCode: REGION,
            active: true,
            subdivisions: [
              { code: 'CA-QC', name: 'Quebec', wholeCountry: false },
              { code: 'CA-ON', name: 'Ontario', wholeCountry: false },
            ],
          },
        ],
      },
    ],
  },
  'GET /api/v1/regions/{region}/binder-counts': { region: REGION, subdivisions: [], total: 0 },
  'GET /api/v1/inventory/items': { items: [card], page: 0, size: 50, totalItems: 1, totalPages: 1 },
  'GET /api/v1/inventory/items/{id}': card,
  'GET /api/v1/inventory/summary': {
    ...(operations['GET /api/v1/inventory/summary']?.body as object),
    totalItems: 1,
    totalQuantity: 1,
    byVisibility: { PRIVATE: 0, PUBLIC: 1, TEMPORARILY_PUBLIC: 0 },
    effectivePublicCount: 1,
  },
};

/** Operation keys, the ones without path parameters first so `/items/bulk` beats `/items/{id}`. */
const routes = Object.keys(operations)
  .map((key) => {
    const [method, template] = key.split(' ') as [string, string];
    // Templates hold only letters, digits, '/', '-' and '{param}'.
    const regex = new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`);
    return { key, method, regex, params: (template.match(/\{/g) ?? []).length };
  })
  .sort((a, b) => a.params - b.params);

function pathOf(url: string): string {
  return url.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0] ?? '';
}

function json(status: number, body: unknown): Response {
  if (status === 204 || body === null || body === undefined) {
    return new Response(null, { status: status === 200 ? 204 : status });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The demo's `fetch`: answers every API call on the phone. */
export const demoFetch: typeof globalThis.fetch = async (input, init) => {
  const request = typeof input === 'object' && 'url' in input ? input : null;
  const url = request?.url ?? String(input);
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  const path = pathOf(url);
  const route = routes.find((r) => r.method === method && r.regex.test(path));
  if (!route) {
    return json(404, {
      errorCode: 'NOT_FOUND',
      message: 'Not available in the demo.',
      requestId: 'demo',
      timestamp: new Date().toISOString(),
    });
  }
  const answer = operations[route.key]!;
  const body = route.key in overrides ? overrides[route.key] : answer.body;
  return json(answer.status, body);
};

const demoUser: AuthUser = {
  uid: 'demo',
  email: 'demo@orenjitrade.demo',
  emailVerified: true,
  displayName: 'Demo collector',
  providerIds: ['password'],
};

/** Always signed in as the demo collector; nothing reaches Firebase. */
export const demoAuthPort: AuthPort = {
  usesEmulator: false,
  subscribe(listener) {
    const timer = setTimeout(() => listener(demoUser), 0);
    return () => clearTimeout(timer);
  },
  signIn: async () => demoUser,
  signUp: async () => demoUser,
  signInWithGoogle: async () => demoUser,
  updateDisplayName: async () => demoUser,
  sendEmailVerification: async () => undefined,
  sendPasswordReset: async () => undefined,
  reload: async () => demoUser,
  reauthenticate: async () => undefined,
  reauthenticateWithGoogle: async () => undefined,
  getIdToken: async () => 'demo',
  signOut: async () => undefined,
};
