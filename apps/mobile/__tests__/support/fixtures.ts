import type {
  BinderResponse,
  CardDetail,
  CollectorMarker,
  CollectorPreview,
  CollectorRatingsPage,
  ConversationSummary,
  MatchingItem,
  MessagePage,
  MessageResponse,
  MyPlan,
  NearbyCollectorsResponse,
  PublicBinderSummary,
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
    marketPrice: { amount: 38, currency: 'CAD', updatedAt: '2026-09-30T00:00:00Z' },
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
      location: { publicLabel: 'Plateau-Mont-Royal, Montréal', distanceBucket: 'KM_1_5' },
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

// --- Map discovery, collectors and messages (Phase 4, fictional) ---------------------------------

/** The signed-in collector of `meFixture()`. */
export const SELF_ID = '00000000-0000-4000-8000-0000000000a1';

export function markerFixture(overrides: Partial<CollectorMarker> = {}): CollectorMarker {
  return {
    id: '00000000-0000-4000-8000-0000000000b1',
    handle: 'collector2',
    displayName: 'Noé Verdun',
    avatarUrl: null,
    publicPoint: { lat: 45.458, lng: -73.571 },
    publicLabel: 'Verdun, Montréal',
    distanceBucket: 'KM_1_5',
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

/** The viewer's own entry (the API keeps it in `nearby`). */
export function selfMarkerFixture(overrides: Partial<CollectorMarker> = {}): CollectorMarker {
  return markerFixture({
    id: SELF_ID,
    handle: 'maika',
    displayName: 'Maïka Test',
    publicPoint: { lat: 45.503, lng: -73.569 },
    publicLabel: 'Ville-Marie, Montréal',
    distanceBucket: undefined,
    ...overrides,
  });
}

export function nearbyFixture(
  collectors: CollectorMarker[] = [selfMarkerFixture(), markerFixture()],
  overrides: Partial<NearbyCollectorsResponse> = {}
): NearbyCollectorsResponse {
  return {
    center: { lat: 45.5, lng: -73.57 },
    radiusKm: 10,
    collectors,
    total: collectors.length,
    truncated: false,
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

export function previewFixture(overrides: Partial<CollectorPreview> = {}): CollectorPreview {
  const marker = markerFixture();
  return {
    id: marker.id,
    handle: marker.handle,
    displayName: marker.displayName,
    avatarUrl: null,
    publicPoint: marker.publicPoint,
    publicLabel: marker.publicLabel,
    distanceBucket: 'KM_1_5',
    rating: marker.rating,
    tags: marker.tags,
    games: marker.games,
    lastActiveBucket: 'THIS_WEEK',
    onlineStatus: 'ONLINE',
    binderFreshness: 'ACTIVE',
    publicBinderCount: 1,
    publicItemCount: 14,
    canMessage: true,
    isBlocked: false,
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

export function planFixture(radiusKm: number | null = 25): MyPlan {
  return {
    plan: { code: 'FREE', name: 'Free' },
    limits: [
      {
        key: 'map.radius.max_km',
        allowed: true,
        kind: 'CAP',
        window: 'TOTAL',
        limit: radiusKm ?? undefined,
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
