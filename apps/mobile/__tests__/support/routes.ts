import {
  binderFixture,
  GAMES,
  inventoryPage,
  itemFixture,
  listingStatusFixture,
  summaryFixture,
  LEGAL_DOCUMENTS,
  TAGS,
  locationFixture,
  meFixture,
  notificationsFixture,
  privacyFixture,
  profileFixture,
} from './fixtures';
import { ok, type MockRoutes } from './mockApi';

/** The answers a signed-in, onboarded collector gets; override per test. */
export function signedInRoutes(overrides: MockRoutes = {}): MockRoutes {
  return {
    'GET /api/v1/me': ok(meFixture()),
    'GET /api/v1/me/profile': ok(profileFixture()),
    'GET /api/v1/me/location': ok(locationFixture()),
    'GET /api/v1/me/settings/privacy': ok(privacyFixture()),
    'GET /api/v1/me/settings/notifications': ok(notificationsFixture()),
    'GET /api/v1/me/deletion-requests': ok([]),
    'GET /api/v1/games': ok(GAMES),
    'GET /api/v1/tags': ok(TAGS),
    'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS),
    'GET /api/v1/inventory/items': ok(inventoryPage([itemFixture()])),
    'GET /api/v1/inventory/summary': ok(summaryFixture()),
    'GET /api/v1/binders': ok([binderFixture()]),
    'GET /api/v1/me/listings/status': ok(listingStatusFixture()),
    ...overrides,
  };
}
