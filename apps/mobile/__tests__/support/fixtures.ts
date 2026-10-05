import type {
  CollectorProfileResponse,
  DeletionRequestResponse,
  GameResponse,
  LegalDocument,
  MeResponse,
  MyLocationResponse,
  MyProfileResponse,
  NotificationSettingsResponse,
  PrivacySettings,
  TagResponse,
} from '@/src/api/types';

/** Fictional API answers shaped by the generated types (packages/shared-types). */

export function meFixture(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    handle: 'maika',
    displayName: 'Maïka Test',
    email: 'maika@example.test',
    emailVerified: true,
    roles: ['USER'],
    status: 'ACTIVE',
    avatarUrl: null,
    createdAt: '2026-09-01T12:00:00Z',
    lastActiveAt: null,
    onboarding: { profileComplete: true, tradingAreaSet: true, interestsSet: true },
    requiredConsents: [],
    plan: 'FREE',
    ...overrides,
  };
}

export const NOT_ONBOARDED = { profileComplete: false, tradingAreaSet: false, interestsSet: false };

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    documentType: 'PRIVACY',
    version: '2026-09-01',
    title: 'Privacy Policy',
    url: '/legal/privacy',
    requiredAtRegistration: true,
  },
  {
    documentType: 'TERMS',
    version: '2026-09-01',
    title: 'Terms of Service',
    url: '/legal/terms',
    requiredAtRegistration: true,
  },
  {
    documentType: 'COOKIES',
    version: '2026-09-01',
    title: 'Cookie Policy',
    url: '/legal/cookies',
    requiredAtRegistration: false,
  },
];

export const TAGS: TagResponse[] = [
  {
    id: 'tag-1',
    slug: 'local-pickup',
    label: 'Local pickup',
    category: 'LOGISTICS',
    usageCount: 12,
  },
  {
    id: 'tag-2',
    slug: 'binder-collector',
    label: 'Binder collector',
    category: 'STYLE',
    usageCount: 8,
  },
];

export const GAMES: GameResponse[] = [
  {
    id: 'g1',
    slug: 'pokemon',
    name: 'Pokémon TCG',
    shortName: 'Pokémon',
    status: 'ACTIVE',
    sortOrder: 1,
  },
  {
    id: 'g2',
    slug: 'yugioh',
    name: 'Yu-Gi-Oh! TCG',
    shortName: 'Yu-Gi-Oh!',
    status: 'ACTIVE',
    sortOrder: 2,
  },
];

export function profileFixture(overrides: Partial<MyProfileResponse> = {}): MyProfileResponse {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    handle: 'maika',
    displayName: 'Maïka Test',
    bio: 'Binder collector in Montréal.',
    games: ['pokemon'],
    languages: ['fr', 'en'],
    avatarUrl: null,
    tags: [TAGS[0] as TagResponse],
    profileComplete: true,
    updatedAt: '2026-09-02T12:00:00Z',
    ...overrides,
  };
}

export function locationFixture(overrides: Partial<MyLocationResponse> = {}): MyLocationResponse {
  return {
    tradingArea: {
      lat: 45.502,
      lng: -73.567,
      radiusKm: 10,
      source: 'MANUAL',
      label: 'Ville-Marie, Montréal',
    },
    discoverable: false,
    ...overrides,
  };
}

export function privacyFixture(overrides: Partial<PrivacySettings> = {}): PrivacySettings {
  return {
    discoverable: false,
    showDistance: true,
    showOnlineStatus: false,
    showLastActive: true,
    profileVisibility: 'MEMBERS',
    messagingPermission: 'MEMBERS_WITH_PROFILE',
    wishlistVisible: true,
    searchDiscoverable: true,
    ...overrides,
  };
}

export function notificationsFixture(
  overrides: Partial<NotificationSettingsResponse> = {}
): NotificationSettingsResponse {
  return {
    pushEnabled: true,
    emailEnabled: true,
    inAppEnabled: true,
    categories: {
      MESSAGE: { inApp: true, push: true, email: false },
      WISHLIST_MATCH: { inApp: true, push: false, email: true },
    },
    quietHours: { enabled: false, start: '22:00', end: '08:00', timezone: 'America/Toronto' },
    ...overrides,
  };
}

export function deletionFixture(
  overrides: Partial<DeletionRequestResponse> = {}
): DeletionRequestResponse {
  return {
    id: '00000000-0000-4000-8000-0000000000d1',
    status: 'PENDING',
    requestedAt: '2026-10-01T12:00:00Z',
    scheduledFor: '2026-10-08T12:00:00Z',
    cancelledAt: null,
    exportRequested: false,
    blockers: [],
    ...overrides,
  };
}

export function collectorFixture(
  overrides: Partial<CollectorProfileResponse> = {}
): CollectorProfileResponse {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    handle: 'maika',
    displayName: 'Maïka Test',
    avatarUrl: null,
    bio: 'Binder collector in Montréal.',
    games: ['pokemon'],
    tags: [TAGS[0] as TagResponse],
    location: {
      publicLabel: 'Ville-Marie, Montréal',
      publicPoint: { lat: 45.503, lng: -73.569 },
      distanceBucket: 'KM_1_5',
    },
    memberSince: '2026-09-01T12:00:00Z',
    lastActiveBucket: 'TODAY',
    onlineStatus: 'HIDDEN',
    rating: { average: 4.5, count: 2 },
    publicBinderCount: 1,
    canMessage: true,
    isBlocked: false,
    ...overrides,
  };
}
