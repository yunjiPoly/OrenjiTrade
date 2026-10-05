import type { components } from '@orenji/shared-types';

/**
 * Short names for the generated DTO types (`packages/shared-types`, generated from
 * `docs/api/openapi.json`). Aliases only: never hand-write a server DTO shape (CLAUDE.md).
 */
type Schemas = components['schemas'];

export type MeResponse = Schemas['MeResponse'];
export type OnboardingStatus = Schemas['OnboardingStatus'];
export type RequiredConsent = Schemas['RequiredConsent'];
export type ConsentRequest = Schemas['ConsentRequest'];
export type LegalDocument = Schemas['LegalDocument'];
export type LegalDocumentType = LegalDocument['documentType'];
export type ProblemDetail = Schemas['ProblemDetail'];
export type MetaResponse = Schemas['MetaResponse'];

export type MyProfileResponse = Schemas['MyProfileResponse'];
export type UpdateProfileRequest = Schemas['UpdateProfileRequest'];
export type TagResponse = Schemas['TagResponse'];
export type UpdateProfileTagsRequest = Schemas['UpdateProfileTagsRequest'];
export type AvatarResponse = Schemas['AvatarResponse'];
export type GameResponse = Schemas['GameResponse'];

export type MyLocationResponse = Schemas['MyLocationResponse'];
export type TradingAreaResponse = Schemas['TradingAreaResponse'];
export type UpdateTradingAreaRequest = Schemas['UpdateTradingAreaRequest'];
export type TradingAreaSource = NonNullable<UpdateTradingAreaRequest['source']>;
export type PrivacySettings = Schemas['PrivacySettings'];

export type NotificationSettingsResponse = Schemas['NotificationSettingsResponse'];
export type NotificationSettingsRequest = Schemas['NotificationSettingsRequest'];
export type ChannelPreferences = Schemas['ChannelPreferences'];

export type DeletionRequestResponse = Schemas['DeletionRequestResponse'];
export type CreateDeletionRequest = Schemas['CreateDeletionRequest'];
export type AccountExport = Schemas['AccountExport'];

export type CollectorProfileResponse = Schemas['CollectorProfileResponse'];
export type DistanceBucket = NonNullable<Schemas['CollectorLocation']['distanceBucket']>;
export type LastActiveBucket = CollectorProfileResponse['lastActiveBucket'];

export type UserRole = MeResponse['roles'][number];
export type AccountStatusCode = MeResponse['status'];

// --- Catalog (Phase 2) --------------------------------------------------------------------------
export type GameSchema = Schemas['GameSchema'];
export type GameMetadataField = Schemas['GameMetadataField'];
export type CardSummary = Schemas['CardSummary'];
export type CardSuggestion = Schemas['CardSuggestion'];
export type CardDetail = Schemas['CardDetail'];
export type PrintingSummary = Schemas['PrintingSummary'];
export type PrintingImage = Schemas['PrintingImage'];
export type MarketPrice = Schemas['MarketPrice'];
export type SetSummary = Schemas['SetSummary'];
export type CardPage = Schemas['PageResponseCardSummary'];

// --- Inventory + binders (Phase 3) --------------------------------------------------------------
export type InventoryItemResponse = Schemas['InventoryItemResponse'];
export type InventoryPage = Schemas['PageResponseInventoryItemResponse'];
export type CreateInventoryItemRequest = Schemas['CreateInventoryItemRequest'];
export type UpdateInventoryItemRequest = Schemas['UpdateInventoryItemRequest'];
export type InventorySummaryResponse = Schemas['InventorySummaryResponse'];
export type BulkInventoryRequest = Schemas['BulkInventoryRequest'];
export type BulkInventoryResponse = Schemas['BulkInventoryResponse'];
export type ListingFreshness = Schemas['Freshness'];
export type FreshnessState = ListingFreshness['state'];
export type InventoryAvailability = NonNullable<InventoryItemResponse['availability']>;
export type Visibility = NonNullable<InventoryItemResponse['visibility']>;
export type BinderResponse = Schemas['BinderResponse'];
export type BinderKind = BinderResponse['kind'];
export type CreateBinderRequest = Schemas['CreateBinderRequest'];
export type UpdateBinderRequest = Schemas['UpdateBinderRequest'];
export type PublishMode = Schemas['PublishBinderRequest']['mode'];
export type PublicBinderResponse = Schemas['PublicBinderResponse'];
export type PublicInventoryItem = Schemas['PublicInventoryItem'];
export type PublicInventoryPage = Schemas['PageResponsePublicInventoryItem'];
export type ListingStatus = Schemas['ListingStatus'];

// --- Map discovery + collectors (Phase 4) -------------------------------------------------------
export type NearbyCollectorsResponse = Schemas['NearbyCollectorsResponse'];
export type CollectorMarker = Schemas['CollectorMarker'];
export type MatchingItem = Schemas['MatchingItem'];
export type CollectorPreview = Schemas['CollectorPreview'];
export type CollectorRating = Schemas['CollectorRating'];
export type PublicPoint = Schemas['PublicPoint'];
export type PublicBinderSummary = Schemas['PublicBinderSummary'];
export type RatingResponse = Schemas['RatingResponse'];
export type RatingSummaryResponse = Schemas['RatingSummaryResponse'];
export type CollectorRatingsPage = Schemas['CollectorRatingsPage'];
export type ReferenceResponse = Schemas['ReferenceResponse'];
export type ReferencePage = Schemas['CursorPageReferenceResponse'];
export type MyPlan = Schemas['MyPlan'];
export type LimitStatus = Schemas['LimitStatus'];

// --- Messaging (Phase 5) -----------------------------------------------------------------------
export type ConversationSummary = Schemas['ConversationSummary'];
export type ConversationParticipant = Schemas['ConversationParticipant'];
export type ConversationPage = Schemas['CursorPageConversationSummary'];
export type MessageResponse = Schemas['MessageResponse'];
export type MessagePage = Schemas['CursorPageMessageResponse'];
export type SendMessageRequest = Schemas['SendMessageRequest'];
export type LastMessage = Schemas['LastMessage'];
export type UpdateConversationRequest = Schemas['UpdateConversationRequest'];
export type MessageKind = MessageResponse['kind'];
export type CardLink = Schemas['CardLink'];
export type BinderLink = Schemas['BinderLink'];
export type OfferLink = Schemas['OfferLink'];
export type MessageImage = Schemas['MessageImage'];
export type ImageUploadResponse = Schemas['ImageUploadResponse'];
export type BlockedUser = Schemas['BlockedUser'];

// --- Community (Phase 5) ------------------------------------------------------------------------
export type CommunityChannel = Schemas['CommunityChannel'];
export type ChannelKind = CommunityChannel['kind'];
export type CommunityAuthor = Schemas['CommunityAuthor'];
export type PostResponse = Schemas['PostResponse'];
export type PostPage = Schemas['CursorPagePostResponse'];
export type ReplyResponse = Schemas['ReplyResponse'];
export type ReplyPage = Schemas['CursorPageReplyResponse'];
export type CreatePostRequest = Schemas['CreatePostRequest'];

// --- Wishlist + notifications (Phase 6) ---------------------------------------------------------
export type WishlistItemResponse = Schemas['WishlistItemResponse'];
export type WishlistCardRef = Schemas['WishlistCardRef'];
export type CreateWishlistItemRequest = Schemas['CreateWishlistItemRequest'];
export type UpdateWishlistItemRequest = Schemas['UpdateWishlistItemRequest'];
export type TradePreference = WishlistItemResponse['tradePreference'];
export type WishlistMatchResponse = Schemas['WishlistMatchResponse'];
export type WishlistMatchPage = Schemas['CursorPageWishlistMatchResponse'];
export type NotificationResponse = Schemas['NotificationResponse'];
export type NotificationType = NotificationResponse['type'];
export type NotificationPage = Schemas['CursorPageNotificationResponse'];
export type UnreadNotificationCount = Schemas['UnreadNotificationCount'];
export type ReadAllNotificationsResponse = Schemas['ReadAllNotificationsResponse'];
