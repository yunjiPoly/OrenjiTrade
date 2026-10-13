import type {
  BlockedUser,
  CardHolderResult,
  CardHoldersPage,
  SetDetail,
  UnifiedSearchResponse,
  WishlistSummaryEntry,
  MyReport,
  OfferPage,
  OfferParty,
  OfferResponse,
  OfferSummary,
  RatingEligibility,
  ReportReasonOption,
  TradePage,
  TradeResponse,
  TradeSummary,
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
  ConversationSummary,
  MatchingItem,
  MessagePage,
  MessageResponse,
  MyPlan,
  Place,
  PublicBinderSummary,
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
    plan: 'FREE',
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
  },
  {
    id: 'g2',
    slug: 'yugioh',
    name: 'Yu-Gi-Oh! TCG',
    shortName: 'Yu-Gi-Oh!',
    status: 'ACTIVE',
    sortOrder: 2,
    schema: YUGIOH_SCHEMA,
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
    ...overrides,
  };
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
    ...overrides,
  };
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
    tags: ['local-pickup'],
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
        comment: 'Smooth trade at the café.',
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

export function planFixture(viewsPerDay: number | null = 25): MyPlan {
  return {
    plan: { code: 'FREE', name: 'Free' },
    limits: [
      {
        key: 'binder.views.per_day',
        allowed: true,
        kind: 'COUNTER',
        window: 'DAY',
        limit: viewsPerDay ?? undefined,
        used: 0,
        planCode: 'FREE',
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

// --- Ratings, reports, offers and trades (Phases 7 and 8, fictional) -----------------------------

/** The other collector of the offer and trade fixtures (the signed-in one is `meFixture`). */
export const OTHER_ID = '00000000-0000-4000-8000-0000000000b1';
export const OFFER_ID = '00000000-0000-4000-9c00-000000000001';
export const TRADE_ID = '00000000-0000-4000-9d00-000000000001';
export const BUYER_ITEM_ID = '00000000-0000-4000-8c00-000000020202';

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

export function offerPartyFixture(overrides: Partial<OfferParty> = {}): OfferParty {
  return {
    id: OTHER_ID,
    handle: 'collector2',
    displayName: 'Noé Verdun',
    avatarUrl: null,
    place: ONTARIO,
    rating: { average: 4.5, count: 2 },
    ...overrides,
  };
}

export const SELF_PARTY: OfferParty = {
  id: '00000000-0000-4000-8000-0000000000a1',
  handle: 'maika',
  displayName: 'Maïka Test',
  avatarUrl: null,
  rating: { average: null, count: 0 },
};

/** An OPEN cash offer of 40 CAD by Maïka (the buyer, signed in) on Noé's Azure-Eyes. */
export function offerFixture(overrides: Partial<OfferResponse> = {}): OfferResponse {
  return {
    id: OFFER_ID,
    rootOfferId: OFFER_ID,
    counterOf: null,
    latestOfferId: OFFER_ID,
    item: publicItemFixture(),
    seller: offerPartyFixture(),
    buyer: SELF_PARTY,
    viewerRole: 'BUYER',
    kind: 'CASH',
    cashAmount: 40,
    currency: 'CAD',
    tradeItems: [],
    message: 'Could we meet at the café?',
    status: 'OPEN',
    currentTurn: 'SELLER',
    superseded: false,
    expiresAt: '2099-10-08T12:00:00Z',
    version: 0,
    protectionRequested: false,
    allowedActions: ['CANCEL'],
    tradeId: null,
    history: [
      {
        id: '00000000-0000-4000-9c10-000000000001',
        offerId: OFFER_ID,
        event: 'CREATED',
        actorRole: 'BUYER',
        reason: null,
        terms: {
          status: 'OPEN',
          kind: 'CASH',
          cashAmount: 40,
          currency: 'CAD',
          tradeItems: [],
          message: 'Could we meet at the café?',
          currentTurn: 'SELLER',
          expiresAt: '2099-10-08T12:00:00Z',
          version: 0,
        },
        createdAt: '2026-10-05T10:00:00Z',
      },
    ],
    createdAt: '2026-10-05T10:00:00Z',
    updatedAt: '2026-10-05T10:00:00Z',
    closedAt: null,
    ...overrides,
  };
}

export function offerSummaryFixture(overrides: Partial<OfferSummary> = {}): OfferSummary {
  return {
    id: OFFER_ID,
    rootOfferId: OFFER_ID,
    item: publicItemFixture(),
    counterparty: offerPartyFixture(),
    viewerRole: 'SELLER',
    kind: 'CASH',
    cashAmount: 40,
    currency: 'CAD',
    tradeItemCount: 0,
    status: 'OPEN',
    currentTurn: 'SELLER',
    yourTurn: true,
    allowedActions: ['ACCEPT', 'COUNTER', 'DECLINE'],
    expiresAt: '2099-10-08T12:00:00Z',
    version: 0,
    tradeId: null,
    createdAt: '2026-10-05T10:00:00Z',
    updatedAt: '2026-10-05T10:00:00Z',
    ...overrides,
  };
}

export function offerPage(items: OfferSummary[] = [offerSummaryFixture()]): OfferPage {
  return { items, nextCursor: null, hasMore: false };
}

/** An AGREED trade from the accepted offer, Maïka buying (her turn to meet and confirm). */
export function tradeFixture(overrides: Partial<TradeResponse> = {}): TradeResponse {
  return {
    id: TRADE_ID,
    offer: offerFixture({ status: 'ACCEPTED', allowedActions: [], tradeId: TRADE_ID }),
    viewerRole: 'BUYER',
    counterparty: offerPartyFixture(),
    kind: 'CASH',
    cashAmount: 40,
    currency: 'CAD',
    status: 'AGREED',
    protectionEnabled: false,
    meetup: false,
    buyerMarkedMeetup: false,
    sellerMarkedMeetup: false,
    buyerConfirmedAt: null,
    sellerConfirmedAt: null,
    nextAction: { actor: 'BUYER', action: 'MEET' },
    allowedOperations: ['MARK_MEETUP', 'CONFIRM_COMPLETION', 'CANCEL'],
    timeline: [
      {
        id: '00000000-0000-4000-9d10-000000000001',
        event: 'CREATED',
        actorRole: 'SELLER',
        details: {},
        createdAt: '2026-10-05T11:00:00Z',
      },
    ],
    cancelReason: null,
    createdAt: '2026-10-05T11:00:00Z',
    updatedAt: '2026-10-05T11:00:00Z',
    completedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

export function tradeSummaryFixture(overrides: Partial<TradeSummary> = {}): TradeSummary {
  return {
    id: TRADE_ID,
    offerId: OFFER_ID,
    item: publicItemFixture(),
    counterparty: offerPartyFixture(),
    viewerRole: 'BUYER',
    kind: 'CASH',
    cashAmount: 40,
    currency: 'CAD',
    tradeItemCount: 0,
    status: 'AGREED',
    protectionEnabled: false,
    meetup: false,
    nextAction: { actor: 'BUYER', action: 'MEET' },
    createdAt: '2026-10-05T11:00:00Z',
    updatedAt: '2026-10-05T11:00:00Z',
    completedAt: null,
    ...overrides,
  };
}

export function tradePage(items: TradeSummary[] = [tradeSummaryFixture()]): TradePage {
  return { items, nextCursor: null, hasMore: false };
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
