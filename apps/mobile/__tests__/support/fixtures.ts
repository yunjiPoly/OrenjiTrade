import type {
  BlockedUser,
  CollectorByName,
  WishlistAvailability,
  CardHolderResult,
  CardHoldersPage,
  SetDetail,
  UnifiedSearchResponse,
  WishlistSummaryEntry,
  MyReport,
  RatingEligibility,
  ReportReasonOption,
  BinderResponse,
  CommunityChannel,
  ConversationPage,
  NotificationPage,
  NotificationResponse,
  PostPage,
  PostResponse,
  ReplyPage,
  ReplyResponse,
  WishlistItemResponse,
  WishPriceTerm,
  CardDetail,
  CollectorMarker,
  CollectorRatingsPage,
  ConversationSubject,
  ConversationSummary,
  MatchingItem,
  MessagePage,
  MessageResponse,
  SaleNotice,
  MyLimits,
  Place,
  PublicBinderCursorPage,
  PublicBinderSummary,
  RegionBinderCounts,
  RegionsResponse,
  PublicInventoryPage,
  ReferencePage,
  CardPage,
  CardSummary,
  CollectorProfileResponse,
  InventoryItemResponse,
  InventoryPage,
  InventorySummaryResponse,
  ListingStatus,
  PrintingSummary,
  PublicBinderResponse,
  PublicInventoryItem,
  SetSummary,
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

/** Public places (ADR 0017): a state or province and its country, never a position. */
export const QUEBEC: Place = {
  regionCode: 'americas-north',
  countryCode: 'CA',
  countryName: 'Canada',
  subdivisionCode: 'CA-QC',
  subdivisionName: 'Quebec',
  label: 'Quebec, Canada',
};

export const ONTARIO: Place = {
  regionCode: 'americas-north',
  countryCode: 'CA',
  countryName: 'Canada',
  subdivisionCode: 'CA-ON',
  subdivisionName: 'Ontario',
  label: 'Ontario, Canada',
};

/** `GET /regions` (a small slice of the seeded catalogue: three regions, a few countries). */
export function regionsFixture(): RegionsResponse {
  return {
    regions: [
      {
        code: 'americas-north',
        name: 'Americas (North)',
        isDefault: true,
        countries: [
          {
            code: 'CA',
            name: 'Canada',
            regionCode: 'americas-north',
            active: true,
            subdivisions: [
              { code: 'CA-ON', name: 'Ontario', wholeCountry: false },
              { code: 'CA-QC', name: 'Quebec', wholeCountry: false },
            ],
          },
          {
            code: 'US',
            name: 'United States',
            regionCode: 'americas-north',
            active: true,
            subdivisions: [{ code: 'US-WY', name: 'Wyoming', wholeCountry: false }],
          },
        ],
      },
      {
        code: 'americas-south',
        name: 'Americas (South)',
        isDefault: false,
        countries: [
          {
            code: 'UY',
            name: 'Uruguay',
            regionCode: 'americas-south',
            active: true,
            subdivisions: [{ code: 'UY-MO', name: 'Montevideo', wholeCountry: false }],
          },
        ],
      },
      {
        code: 'europe',
        name: 'Europe',
        isDefault: false,
        countries: [
          {
            code: 'FR',
            name: 'France',
            regionCode: 'europe',
            active: true,
            subdivisions: [{ code: 'FR-BRE', name: 'Brittany', wholeCountry: false }],
          },
          {
            code: 'VA',
            name: 'Vatican City',
            regionCode: 'europe',
            active: true,
            subdivisions: [{ code: 'VA', name: 'Vatican City', wholeCountry: true }],
          },
        ],
      },
    ],
  };
}

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
    onboarding: {
      profileComplete: true,
      locationSet: true,
      interestsSet: true,
      ageConfirmed: true,
    },
    requiredConsents: [],
    ...overrides,
  };
}

export const NOT_ONBOARDED = { profileComplete: false, locationSet: false, interestsSet: false };

/** The 18+ attestation as the API publishes it (never required at registration). */
export const AGE_CONFIRMATION: LegalDocument = {
  documentType: 'AGE_CONFIRMATION',
  version: '2026-10-05',
  title: 'Age confirmation (18 years or older)',
  url: '/legal#age-confirmation',
  requiredAtRegistration: false,
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  AGE_CONFIRMATION,
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
    slug: 'tracked-shipping',
    label: 'Tracked shipping',
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

export const POKEMON_SCHEMA: NonNullable<GameResponse['schema']> = {
  conditions: ['NEAR_MINT', 'LIGHTLY_PLAYED', 'DAMAGED'],
  editions: ['UNLIMITED', 'FIRST_EDITION'],
  finishes: ['NORMAL', 'HOLO', 'REVERSE_HOLO'],
  languages: ['en', 'fr'],
  rarities: ['Common', 'Ultra Rare'],
  metadataFields: [
    { key: 'hp', label: 'HP', type: 'number' },
    { key: 'types', label: 'Types', type: 'string_list' },
  ],
  summaryFields: ['hp'],
};

export const YUGIOH_SCHEMA: NonNullable<GameResponse['schema']> = {
  conditions: ['NEAR_MINT', 'LIGHTLY_PLAYED'],
  editions: ['FIRST_EDITION', 'UNLIMITED'],
  finishes: ['NORMAL'],
  languages: ['en', 'fr', 'ja'],
  rarities: ['Common', 'Secret Rare'],
  metadataFields: [{ key: 'attribute', label: 'Attribute', type: 'string' }],
  summaryFields: [],
};

export const GAMES: GameResponse[] = [
  {
    id: 'g1',
    slug: 'pokemon',
    name: 'Pokémon TCG',
    shortName: 'Pokémon',
    status: 'ACTIVE',
    sortOrder: 1,
    schema: POKEMON_SCHEMA,
    hasCards: true,
  },
  {
    id: 'g2',
    slug: 'yugioh',
    name: 'Yu-Gi-Oh! TCG',
    shortName: 'Yu-Gi-Oh!',
    status: 'ACTIVE',
    sortOrder: 2,
    schema: YUGIOH_SCHEMA,
    hasCards: true,
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
    location: {
      ...QUEBEC,
      regionName: 'Americas (North)',
      city: 'Montréal',
      showCity: true,
    },
    discoverable: false,
    ...overrides,
  };
}

export function privacyFixture(overrides: Partial<PrivacySettings> = {}): PrivacySettings {
  return {
    discoverable: false,
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
    wishlistAlerts: true,
    categories: {
      MESSAGE: { inApp: true, push: true, email: false },
      OFFER: { inApp: true, push: false, email: true },
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
    location: { ...QUEBEC, city: 'Montréal' },
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

// --- Catalog, inventory and binders (fictional seed-like data) ----------------------------------

export const CARD_ID = '00000000-0000-4000-8a00-000000000001';
export const PRINTING_A = '00000000-0000-4000-8a10-00000000000a';
export const PRINTING_B = '00000000-0000-4000-8a10-00000000000b';
export const ITEM_ID = '00000000-0000-4000-8c00-000000000001';
export const BINDER_ID = '00000000-0000-4000-8b00-000000000001';

export function printingFixture(overrides: Partial<PrintingSummary> = {}): PrintingSummary {
  return {
    id: PRINTING_A,
    cardId: CARD_ID,
    setId: '00000000-0000-4000-8a20-000000000001',
    setCode: 'SVX',
    setName: 'Stellar Vortex',
    collectorNumber: '001',
    printingCode: 'SVX-001',
    rarity: 'Ultra Rare',
    edition: 'UNLIMITED',
    language: 'en',
    finish: 'HOLO',
    images: [{ kind: 'FRONT', url: '/api/v1/public/card-images/pa', width: 320, height: 446 }],
    marketPrice: {
      amount: 38,
      currency: 'CAD',
      updatedAt: '2026-09-30T00:00:00Z',
      source: 'SAMPLE',
    },
    ...overrides,
  };
}

export function cardSummaryFixture(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: CARD_ID,
    game: 'pokemon',
    name: 'Emberfang Fox VMAX',
    slug: 'emberfang-fox-vmax',
    cardType: 'Pokémon',
    subtype: 'VMAX',
    primaryImageUrl: '/api/v1/public/card-images/pa',
    printingCount: 2,
    metadata: { hp: 320 },
    ...overrides,
  };
}

export function cardPage(
  items: CardSummary[],
  page = 0,
  totalPages = 1,
  totalItems?: number
): CardPage {
  return { items, page, size: 24, totalItems: totalItems ?? items.length, totalPages };
}

export function cardDetailFixture(overrides: Partial<CardDetail> = {}): CardDetail {
  return {
    id: CARD_ID,
    game: 'pokemon',
    name: 'Emberfang Fox VMAX',
    slug: 'emberfang-fox-vmax',
    cardType: 'Pokémon',
    subtype: 'VMAX',
    text: 'A fictional Fire creature.',
    metadata: { hp: 320, types: ['Fire'], weakness: 'Water' },
    primaryImageUrl: '/api/v1/public/card-images/pa',
    printings: [
      printingFixture(),
      printingFixture({
        id: PRINTING_B,
        language: 'fr',
        finish: 'REVERSE_HOLO',
        images: [{ kind: 'FRONT', url: '/api/v1/public/card-images/pb', width: 320, height: 446 }],
        marketPrice: undefined,
      }),
    ],
    ...overrides,
  };
}

export const SETS: SetSummary[] = [
  { id: 's1', game: 'pokemon', code: 'SVX', name: 'Stellar Vortex' },
  { id: 's2', game: 'pokemon', code: 'PFT', name: 'Prismatic Frontier' },
];

export function itemFixture(overrides: Partial<InventoryItemResponse> = {}): InventoryItemResponse {
  return {
    id: ITEM_ID,
    printing: printingFixture(),
    card: { id: CARD_ID, name: 'Emberfang Fox VMAX', game: 'pokemon' },
    binder: undefined,
    quantity: 2,
    condition: 'NEAR_MINT',
    language: 'en',
    edition: 'UNLIMITED',
    finish: 'HOLO',
    askingPrice: 40,
    currency: 'CAD',
    availability: 'TRADE_OR_SALE',
    acceptsOffers: true,
    notes: 'Pulled at locals.',
    publicNotes: 'Sleeved.',
    visibility: 'PRIVATE',
    publicUntil: null,
    effectivePublic: false,
    freshness: {
      state: 'ACTIVE',
      confirmedAt: '2026-10-01T12:00:00Z',
      updatedAt: '2026-10-01T12:00:00Z',
      label: 'Updated 3 days ago',
    },
    images: [],
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    ...overrides,
  };
}

export function inventoryPage(
  items: InventoryItemResponse[],
  page = 0,
  totalPages = 1,
  totalItems?: number
): InventoryPage {
  return { items, page, size: 24, totalItems: totalItems ?? items.length, totalPages };
}

export function summaryFixture(
  overrides: Partial<InventorySummaryResponse> = {}
): InventorySummaryResponse {
  return {
    totalItems: 1,
    totalQuantity: 2,
    byVisibility: { PRIVATE: 1, PUBLIC: 0, TEMPORARILY_PUBLIC: 0 },
    byGame: { pokemon: 1 },
    agingCount: 0,
    staleCount: 0,
    hiddenCount: 0,
    effectivePublicCount: 0,
    nextExpiry: null,
    ...overrides,
  };
}

export function binderFixture(overrides: Partial<BinderResponse> = {}): BinderResponse {
  return {
    id: BINDER_ID,
    name: 'Trade binder',
    description: 'Duplicates for trade.',
    kind: 'TRADE',
    visibility: 'PRIVATE',
    publicUntil: null,
    sortOrder: 0,
    itemCount: 1,
    publicItemCount: 0,
    effectivePublic: false,
    games: ['pokemon'],
    game: 'pokemon',
    gameId: 'g1',
    coverImageUrl: null,
    coverPrintingId: null,
    freshness: {
      state: 'ACTIVE',
      confirmedAt: '2026-10-01T12:00:00Z',
      updatedAt: '2026-10-01T12:00:00Z',
      label: 'Updated 3 days ago',
    },
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    sellsAsCore: false,
    askingPriceText: null,
    askingPrice: null,
    currency: 'CAD',
    soldAt: null,
    photos: [],
    previewImages: ['/api/v1/public/card-images/pa'],
    keyCards: [],
    ...overrides,
  };
}

/** A photo of a binder (a deck core's), as the API serves it. */
export const BINDER_PHOTO = {
  id: '00000000-0000-4000-8b10-000000000001',
  url: '/api/v1/public/media/binders/core-1.jpg',
  width: 1200,
  height: 900,
  sortOrder: 0,
};

/** One of the caller's deck cores ("Sell as a deck core" on, a photo and a price; stage R3). */
export function deckCoreFixture(overrides: Partial<BinderResponse> = {}): BinderResponse {
  return binderFixture({
    id: '00000000-0000-4000-8b00-000000000002',
    name: 'Snake-Eye core',
    description: 'All NM, English. Sleeves and a deck box included.',
    kind: 'DECK',
    visibility: 'PUBLIC',
    effectivePublic: true,
    itemCount: 0,
    games: [],
    sellsAsCore: true,
    askingPriceText: '$180',
    askingPrice: 180,
    photos: [BINDER_PHOTO],
    previewImages: [BINDER_PHOTO.url],
    ...overrides,
  });
}

export function publicBinderFixture(
  overrides: Partial<PublicBinderResponse> = {}
): PublicBinderResponse {
  return {
    id: BINDER_ID,
    name: 'Yu-Gi-Oh! trade binder',
    description: 'Trade bait.',
    kind: 'TRADE',
    publicUntil: null,
    owner: {
      id: '00000000-0000-4000-8000-000000000001',
      handle: 'collector1',
      displayName: 'Collector One',
      avatarUrl: null,
      place: QUEBEC,
    },
    freshness: {
      state: 'ACTIVE',
      confirmedAt: '2026-10-01T12:00:00Z',
      updatedAt: '2026-10-01T12:00:00Z',
      label: 'Updated yesterday',
    },
    itemCount: 1,
    games: ['yugioh'],
    coverImageUrl: null,
    sellsAsCore: false,
    askingPriceText: null,
    photos: [],
    previewImages: ['/api/v1/public/card-images/pa'],
    keyCards: [],
    ownerPublicBinderCount: 2,
    ...overrides,
  };
}

/** Someone's public deck core, as buyers see it (mockup screen 16). */
export function publicDeckCoreFixture(
  overrides: Partial<PublicBinderResponse> = {}
): PublicBinderResponse {
  return publicBinderFixture({
    id: 'core-1',
    name: 'Yubel core',
    description: 'Full Yubel engine plus 2 Ash Blossom. All NM, English.',
    kind: 'DECK',
    itemCount: 8,
    sellsAsCore: true,
    askingPriceText: '$95',
    photos: [
      BINDER_PHOTO,
      {
        ...BINDER_PHOTO,
        id: 'photo-2',
        url: '/api/v1/public/media/binders/core-2.jpg',
        sortOrder: 1,
      },
      {
        ...BINDER_PHOTO,
        id: 'photo-3',
        url: '/api/v1/public/media/binders/core-3.jpg',
        sortOrder: 2,
      },
    ],
    previewImages: [BINDER_PHOTO.url],
    keyCards: [
      { cardId: 'card-yubel', name: 'Yubel', quantity: 3 },
      { cardId: 'card-spirit', name: 'Spirit of Yubel', quantity: 3 },
      { cardId: 'card-ash', name: 'Ash Blossom & Joyous Spring', quantity: 2 },
    ],
    ...overrides,
  });
}

export function publicItemFixture(
  overrides: Partial<PublicInventoryItem> = {}
): PublicInventoryItem {
  return {
    id: '00000000-0000-4000-8c00-000000010101',
    printing: printingFixture({ printingCode: 'AZR-EN001', setName: 'Azure Dawn', setCode: 'AZR' }),
    card: { id: CARD_ID, name: 'Azure-Eyes Sky Dragon', game: 'yugioh' },
    binder: { id: BINDER_ID, name: 'Yu-Gi-Oh! trade binder' },
    quantity: 1,
    condition: 'NEAR_MINT',
    language: 'en',
    edition: 'FIRST_EDITION',
    finish: 'NORMAL',
    askingPrice: 45,
    currency: 'CAD',
    availability: 'TRADE_OR_SALE',
    acceptsOffers: true,
    publicNotes: 'Pack fresh.',
    images: [],
    freshness: {
      state: 'ACTIVE',
      confirmedAt: '2026-10-01T12:00:00Z',
      updatedAt: '2026-10-01T12:00:00Z',
      label: 'Updated yesterday',
    },
    ...overrides,
  };
}

export function listingStatusFixture(overrides: Partial<ListingStatus> = {}): ListingStatus {
  return {
    paused: false,
    source: null,
    reason: null,
    pausedAt: null,
    pausedUntil: null,
    canResume: false,
    strikes: 0,
    maxStrikes: 3,
    unansweredConversations30d: 0,
    evaluatedAt: null,
    ...overrides,
  };
}

// --- Collectors and messages (Phase 4, fictional) ------------------------------------------------

/** The signed-in collector of `meFixture()`. */
export const SELF_ID = '00000000-0000-4000-8000-0000000000a1';

export function markerFixture(overrides: Partial<CollectorMarker> = {}): CollectorMarker {
  return {
    id: '00000000-0000-4000-8000-0000000000b1',
    handle: 'collector2',
    displayName: 'Noé Verdun',
    avatarUrl: null,
    place: ONTARIO,
    rating: { average: 4.8, count: 12 },
    tags: ['tracked-shipping'],
    games: ['mtg'],
    lastActiveBucket: 'THIS_WEEK',
    onlineStatus: 'HIDDEN',
    binderFreshness: 'ACTIVE',
    publicBinderCount: 1,
    publicItemCount: 14,
    matchingItems: [],
    ...overrides,
  };
}

export function matchingItemFixture(overrides: Partial<MatchingItem> = {}): MatchingItem {
  return {
    itemId: '00000000-0000-4000-8c00-0000000000f1',
    printingId: '00000000-0000-4000-8a10-00000000000a',
    printingCode: 'LOB-001',
    cardId: '00000000-0000-4000-8a00-000000000001',
    cardName: 'Lantern Fox Spirit',
    game: 'yugioh',
    availability: 'TRADE_OR_SALE',
    askingPrice: 12.5,
    currency: 'CAD',
    condition: 'NEAR_MINT',
    language: 'en',
    edition: 'UNLIMITED',
    acceptsOffers: true,
    freshness: 'ACTIVE',
    ...overrides,
  };
}

export const PUBLIC_BINDER_ID = '00000000-0000-4000-8b00-0000000000c1';

export function publicBinderSummaryFixture(
  overrides: Partial<PublicBinderSummary> = {}
): PublicBinderSummary {
  return {
    id: PUBLIC_BINDER_ID,
    name: 'Magic trades',
    description: 'Doubles for trade.',
    kind: 'TRADE',
    publicUntil: null,
    itemCount: 14,
    games: ['mtg'],
    coverImageUrl: null,
    freshness: {
      state: 'ACTIVE',
      confirmedAt: '2026-10-01T12:00:00Z',
      updatedAt: '2026-10-01T12:00:00Z',
      label: 'Updated yesterday',
    },
    ...overrides,
  };
}

export function publicItemsPage(items: PublicInventoryItem[] = []): PublicInventoryPage {
  return { items, page: 0, size: 8, totalItems: items.length, totalPages: items.length ? 1 : 0 };
}

export function ratingsPageFixture(
  overrides: Partial<CollectorRatingsPage> = {}
): CollectorRatingsPage {
  return {
    items: [
      {
        id: '00000000-0000-4000-8d00-000000000001',
        rater: { handle: 'collector5', displayName: 'Léa Mile End', avatarUrl: null },
        overall: 5,
        breakdown: { communication: 5 },
        comment: 'Well packed, shipped with tracking.',
        createdAt: '2026-09-20T12:00:00Z',
        updatedAt: '2026-09-20T12:00:00Z',
        interactionKind: 'TRADE',
        editableUntil: '2026-10-04T12:00:00Z',
      },
    ],
    nextCursor: null,
    hasMore: false,
    summary: { average: 4.8, count: 12, communication: 4.9, conditionAccuracy: 4.7 },
    ...overrides,
  };
}

export function referencesPageFixture(overrides: Partial<ReferencePage> = {}): ReferencePage {
  return {
    items: [
      {
        id: '00000000-0000-4000-8d10-000000000001',
        author: { handle: 'collector1', displayName: 'Ayumi Plateau', avatarUrl: null },
        body: 'Fair and friendly trader.',
        createdAt: '2026-09-25T12:00:00Z',
      },
    ],
    nextCursor: null,
    hasMore: false,
    ...overrides,
  };
}

/** `GET /me/limits`: the same limits for every collector (stage F1). */
export function limitsFixture(viewsPerDay: number | null = 25): MyLimits {
  return {
    limits: [
      {
        key: 'binder.views.per_day',
        allowed: true,
        kind: 'COUNTER',
        window: 'DAY',
        limit: viewsPerDay ?? undefined,
        used: 0,
      },
    ],
  };
}

export const CONVERSATION_ID = '00000000-0000-4000-8e00-000000000001';

export function conversationFixture(
  overrides: Partial<ConversationSummary> = {}
): ConversationSummary {
  return {
    id: CONVERSATION_ID,
    other: {
      id: '00000000-0000-4000-8000-0000000000b1',
      handle: 'collector2',
      displayName: 'Noé Verdun',
      avatarUrl: null,
      onlineStatus: 'HIDDEN',
    },
    unreadCount: 0,
    muted: false,
    archived: false,
    createdAt: '2026-10-01T12:00:00Z',
    ...overrides,
  };
}

/** The card a chat is about (stage R4): collector2's public card, as the buyer sees it. */
export function subjectFixture(overrides: Partial<ConversationSubject> = {}): ConversationSubject {
  return {
    kind: 'CARD',
    id: ITEM_ID,
    ownerId: '00000000-0000-4000-8000-0000000000b1',
    name: 'Emberfang Fox VMAX',
    printingCode: 'SVX-001',
    rarity: 'Ultra Rare',
    cardId: CARD_ID,
    printingId: PRINTING_A,
    imageUrl: '/api/v1/public/card-images/pa',
    askingPriceText: '$32',
    sold: false,
    listed: true,
    copies: null,
    ...overrides,
  };
}

/** A deck core a chat is about (stage R4). */
export function deckCoreSubjectFixture(
  overrides: Partial<ConversationSubject> = {}
): ConversationSubject {
  return subjectFixture({
    kind: 'DECK_CORE',
    id: BINDER_ID,
    name: 'Snake-Eye core',
    printingCode: null,
    rarity: null,
    cardId: null,
    printingId: null,
    imageUrl: null,
    askingPriceText: '$95',
    ...overrides,
  });
}

/** The SYSTEM message of a sale (stage R4). */
export function saleMessageFixture(
  sale: Partial<SaleNotice> = {},
  overrides: Partial<MessageResponse> = {}
): MessageResponse {
  return messageFixture({
    id: 'm-sale',
    kind: 'SYSTEM',
    senderId: null,
    body: 'collector2 marked Emberfang Fox VMAX as sold to maika.',
    createdAt: '2026-10-04T12:10:00Z',
    payload: {
      sale: {
        saleId: 'sale-1',
        sellerId: '00000000-0000-4000-8000-0000000000b1',
        buyerId: SELF_ID,
        kind: 'CARD',
        name: 'Emberfang Fox VMAX',
        quantity: 1,
        trackingNumber: '7023 2109 8876 5432',
        undone: false,
        ...sale,
      },
    },
    ...overrides,
  });
}

export function messageFixture(overrides: Partial<MessageResponse> = {}): MessageResponse {
  return {
    id: '00000000-0000-4000-8e10-000000000001',
    conversationId: CONVERSATION_ID,
    senderId: '00000000-0000-4000-8000-0000000000b1',
    kind: 'TEXT',
    body: 'Hi! Still have the Lantern Fox?',
    payload: {},
    createdAt: '2026-10-04T12:00:00Z',
    editedAt: null,
    readByOther: false,
    moderationState: 'OK',
    ...overrides,
  };
}

export function messagePage(items: MessageResponse[] = [messageFixture()]): MessagePage {
  return { items, nextCursor: null, hasMore: false };
}

export function conversationPage(
  items: ConversationSummary[] = [conversationFixture()],
  overrides: Partial<ConversationPage> = {}
): ConversationPage {
  return { items, nextCursor: null, hasMore: false, ...overrides };
}

// --- Community (Phase 5, fictional) -------------------------------------------------------------

export function channelFixture(overrides: Partial<CommunityChannel> = {}): CommunityChannel {
  return {
    id: '00000000-0000-4000-8f00-000000000001',
    slug: 'americas-north',
    name: 'Americas (North)',
    kind: 'REGION',
    game: null,
    regionLabel: 'americas-north',
    description: 'Canada, the United States, Mexico, Central America and the Caribbean.',
    postCount24h: 3,
    ...overrides,
  };
}

export const CHANNELS: CommunityChannel[] = [
  channelFixture(),
  channelFixture({
    id: '00000000-0000-4000-8f00-000000000002',
    slug: 'yugioh',
    name: 'Yu-Gi-Oh!',
    kind: 'GAME',
    game: 'yugioh',
    regionLabel: null,
    description: 'Every Yu-Gi-Oh! collector.',
    postCount24h: 0,
  }),
  channelFixture({
    id: '00000000-0000-4000-8f00-000000000003',
    slug: 'looking-for',
    name: 'Looking for',
    kind: 'LOOKING_FOR',
    game: null,
    regionLabel: null,
    description: 'Cards you are hunting for.',
    postCount24h: 1,
  }),
];

export function postFixture(overrides: Partial<PostResponse> = {}): PostResponse {
  return {
    id: '00000000-0000-4000-8f10-000000000001',
    channelSlug: 'montreal-pokemon',
    author: {
      id: '00000000-0000-4000-8000-0000000000b1',
      handle: 'collector2',
      displayName: 'Noé Verdun',
      avatarUrl: null,
    },
    body: 'Anyone trading Lantern Fox this weekend?',
    payload: {},
    createdAt: '2026-10-05T10:00:00Z',
    editedAt: null,
    replyCount: 0,
    lastReplyAt: null,
    canEdit: false,
    canDelete: false,
    moderationState: 'OK',
    ...overrides,
  };
}

/** A post of the signed-in collector (`meFixture`). */
export function ownPostFixture(overrides: Partial<PostResponse> = {}): PostResponse {
  return postFixture({
    id: '00000000-0000-4000-8f10-0000000000a1',
    author: { id: SELF_ID, handle: 'maika', displayName: 'Maïka Test', avatarUrl: null },
    body: 'Looking for Azure Dawn boosters.',
    canEdit: true,
    canDelete: true,
    ...overrides,
  });
}

export function postPage(items: PostResponse[] = [postFixture()]): PostPage {
  return { items, nextCursor: null, hasMore: false };
}

export function replyFixture(overrides: Partial<ReplyResponse> = {}): ReplyResponse {
  return {
    id: '00000000-0000-4000-8f20-000000000001',
    postId: '00000000-0000-4000-8f10-000000000001',
    author: { id: SELF_ID, handle: 'maika', displayName: 'Maïka Test', avatarUrl: null },
    body: 'I have one!',
    createdAt: '2026-10-05T10:30:00Z',
    canDelete: true,
    moderationState: 'OK',
    ...overrides,
  };
}

export function replyPage(items: ReplyResponse[] = []): ReplyPage {
  return { items, nextCursor: null, hasMore: false };
}

// --- Wishlist (stage S2) + notifications (Phase 6, fictional) -----------------------------------

export const WISH_ID = '00000000-0000-4000-9a00-000000000001';

export function wishFixture(overrides: Partial<WishlistItemResponse> = {}): WishlistItemResponse {
  return {
    id: WISH_ID,
    game: 'yugioh',
    card: { id: CARD_ID, name: 'Azure-Eyes Sky Dragon', imageUrl: null },
    printing: undefined,
    rarity: null,
    note: 'For my deck.',
    nearMintOnly: true,
    priceTerm: { label: '85% TCG', percent: 85, orMore: false },
    createdAt: '2026-10-04T12:00:00Z',
    updatedAt: '2026-10-04T12:00:00Z',
    ...overrides,
  };
}

/** The admin price terms of V112 (`GET /wishlist/price-terms`). */
export function priceTermsFixture(): { terms: WishPriceTerm[] } {
  return {
    terms: [
      { label: '80% TCG', percent: 80, orMore: false },
      { label: '85% TCG', percent: 85, orMore: false },
      { label: '90% TCG', percent: 90, orMore: false },
      { label: '100% TCG', percent: 100, orMore: false },
      { label: '100% TCG+', percent: 100, orMore: true },
    ],
  };
}

export function notificationFixture(
  overrides: Partial<NotificationResponse> = {}
): NotificationResponse {
  return {
    id: '00000000-0000-4000-9b00-000000000001',
    type: 'WISHLIST_ALERT',
    title: 'Wishlist alert: Azure-Eyes Sky Dragon',
    body: 'Azure-Eyes Sky Dragon AZR-EN001 Ultra Rare was just listed by @collector2 in Ontario, Canada.',
    data: { wishlistItemId: WISH_ID, cardId: CARD_ID, deepLink: `/cards/${CARD_ID}` },
    createdAt: new Date().toISOString(),
    readAt: null,
    ...overrides,
  };
}

export function notificationPage(
  items: NotificationResponse[] = [notificationFixture()],
  overrides: Partial<NotificationPage> = {}
): NotificationPage {
  return { items, nextCursor: null, hasMore: false, ...overrides };
}

// --- Ratings and reports (Phase 7, fictional) ---------------------------------------------------

/** Another collector of the rating fixtures (the signed-in one is `meFixture`). */
export const OTHER_ID = '00000000-0000-4000-8000-0000000000b1';

export function eligibilityFixture(overrides: Partial<RatingEligibility> = {}): RatingEligibility {
  return {
    eligible: true,
    interactions: [
      {
        id: '00000000-0000-4000-9e00-000000000001',
        kind: 'TRADE',
        occurredAt: '2026-10-03T12:00:00Z',
        alreadyRated: false,
      },
    ],
    ...overrides,
  };
}

export const REPORT_REASONS: ReportReasonOption[] = [
  { code: 'SCAM', label: 'Scam or fraud', description: 'Took payment or cards and disappeared.' },
  { code: 'HARASSMENT', label: 'Harassment', description: 'Insults, threats or unwanted contact.' },
  { code: 'OTHER', label: 'Something else', description: 'Tell the moderators what happened.' },
];

export function myReportFixture(overrides: Partial<MyReport> = {}): MyReport {
  return {
    id: '00000000-0000-4000-9f00-000000000001',
    status: 'OPEN',
    reason: 'SCAM',
    createdAt: '2026-10-04T12:00:00Z',
    resolvedAt: null,
    reportedUser: {
      id: OTHER_ID,
      handle: 'collector2',
      displayName: 'Noé Verdun',
      avatarUrl: null,
    },
    ...overrides,
  };
}

// --- Stage M7: unified search, card holders, public wishlist, blocked users, sets -----------------

export function unifiedSearchFixture(
  overrides: Partial<UnifiedSearchResponse> = {}
): UnifiedSearchResponse {
  return {
    query: 'noé',
    cards: [],
    printings: [],
    sets: [],
    region: 'americas-north',
    collectors: [],
    binders: [],
    resolved: { printingId: null, cardId: null },
    ...overrides,
  };
}

/** A public binder of another collector as `GET /search` lists it (with its owner block). */
export function searchBinderFixture(
  overrides: Partial<PublicBinderSummary> = {}
): PublicBinderSummary {
  return publicBinderSummaryFixture({
    owner: {
      id: OTHER_ID,
      handle: 'collector2',
      displayName: 'Noé Verdun',
      avatarUrl: null,
      place: ONTARIO,
    },
    ...overrides,
  });
}

/** `GET /regions/{region}/binder-counts`: Quebec holds two public binders, Ontario one. */
export function binderCountsFixture(
  overrides: Partial<RegionBinderCounts> = {}
): RegionBinderCounts {
  return {
    region: 'americas-north',
    total: 3,
    subdivisions: [
      { code: 'CA-QC', binderCount: 2 },
      { code: 'CA-ON', binderCount: 1 },
    ],
    ...overrides,
  };
}

/** One page of `GET /regions/{region}/subdivisions/{code}/binders`. */
export function placeBindersPage(
  items: PublicBinderSummary[] = [],
  nextCursor: string | null = null
): PublicBinderCursorPage {
  return { items, nextCursor, hasMore: nextCursor !== null };
}

export const HOLDER_ITEM_ID = '00000000-0000-4000-8c00-000000030303';

/** One "who in my region has this card" result: a public copy and its holder (state/province only). */
export function cardHolderFixture(overrides: Partial<CardHolderResult> = {}): CardHolderResult {
  return {
    collector: markerFixture(),
    item: publicItemFixture({ id: HOLDER_ITEM_ID }),
    ...overrides,
  };
}

export function cardHoldersPage(
  items: CardHolderResult[],
  page = 0,
  totalPages = 1,
  totalItems?: number
): CardHoldersPage {
  return { items, page, size: 20, totalItems: totalItems ?? items.length, totalPages };
}

export function wishlistEntryFixture(
  overrides: Partial<WishlistSummaryEntry> = {}
): WishlistSummaryEntry {
  return {
    card: { id: CARD_ID, name: 'Azure-Eyes Sky Dragon', imageUrl: null },
    printing: undefined,
    rarity: null,
    note: 'Sleeved copies welcome.',
    nearMintOnly: true,
    priceTerm: undefined,
    ...overrides,
  };
}

export function blockedUserFixture(overrides: Partial<BlockedUser> = {}): BlockedUser {
  return {
    id: OTHER_ID,
    handle: 'collector2',
    displayName: 'Noé Verdun',
    avatarUrl: null,
    blockedAt: '2026-10-05T12:00:00Z',
    ...overrides,
  };
}

export const SET_ID = '00000000-0000-4000-8a20-000000000001';

export function setDetailFixture(overrides: Partial<SetDetail> = {}): SetDetail {
  return {
    set: {
      id: SET_ID,
      game: 'pokemon',
      code: 'SVX',
      name: 'Scarlet Expanse',
      releaseDate: '2026-03-01',
      totalCards: 2,
      printingCount: 2,
    },
    metadata: {},
    printings: {
      items: [
        printingFixture(),
        printingFixture({ id: PRINTING_B, printingCode: 'SVX-002', collectorNumber: '002' }),
      ],
      page: 0,
      size: 40,
      totalItems: 2,
      totalPages: 1,
    },
    ...overrides,
  };
}

/** A collector of `GET /search/collectors` (stage R5: collectors while a card is typed). */
export function collectorByNameFixture(overrides: Partial<CollectorByName> = {}): CollectorByName {
  return {
    id: OTHER_ID,
    handle: 'collector2',
    displayName: 'Noé Verdun',
    avatarUrl: null,
    place: ONTARIO,
    ...overrides,
  };
}

/** `GET /wishlist/availability` (stage R5): the wishes "Available" in a region. */
export function wishlistAvailabilityFixture(
  available: string[] = [],
  region = 'americas-north'
): WishlistAvailability {
  return { region, available };
}
