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
export type InventoryItemImage = Schemas['InventoryItemImage'];
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
export type UnifiedSearchResponse = Schemas['UnifiedSearchResponse'];
export type CardHolderResult = Schemas['CardHolderResult'];
export type CardHoldersPage = Schemas['PageResponseCardHolderResult'];
export type PublicBinderOwner = Schemas['PublicBinderOwner'];
export type SetDetail = Schemas['SetDetail'];
export type PrintingPage = Schemas['PageResponsePrintingSummary'];

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
export type WishlistSummaryEntry = Schemas['WishlistSummaryEntry'];
export type NotificationResponse = Schemas['NotificationResponse'];
export type NotificationType = NotificationResponse['type'];
export type NotificationPage = Schemas['CursorPageNotificationResponse'];
export type UnreadNotificationCount = Schemas['UnreadNotificationCount'];
export type ReadAllNotificationsResponse = Schemas['ReadAllNotificationsResponse'];

// --- Ratings, references and collector reports (Phase 7) ---------------------------------------
export type RatingEligibility = Schemas['RatingEligibility'];
export type RatingEligibilityInteraction = Schemas['RatingEligibilityInteraction'];
export type InteractionKind = RatingEligibilityInteraction['kind'];
export type RatingBreakdown = Schemas['RatingBreakdown'];
export type CreateRatingRequest = Schemas['CreateRatingRequest'];
export type UpdateRatingRequest = Schemas['UpdateRatingRequest'];
export type CreateReferenceRequest = Schemas['CreateReferenceRequest'];
export type ReportReasonOption = Schemas['ReportReasonOption'];
export type ReportReason = ReportReasonOption['code'];
export type ReportCollectorRequest = Schemas['ReportCollectorRequest'];
export type ReportContextRequest = Schemas['ReportContextRequest'];
export type ReportContextSource = ReportContextRequest['source'];
export type ReportConfirmation = Schemas['ReportConfirmation'];
export type MyReport = Schemas['MyReport'];
export type ReportStatus = MyReport['status'];

// --- Offers and trades (Phase 8) ----------------------------------------------------------------
export type OfferResponse = Schemas['OfferResponse'];
export type OfferSummary = Schemas['OfferSummary'];
export type OfferPage = Schemas['CursorPageOfferSummary'];
export type OfferParty = Schemas['OfferParty'];
export type OfferTradeItem = Schemas['OfferTradeItem'];
export type OfferEvent = Schemas['OfferEvent'];
export type OfferTerms = Schemas['OfferTerms'];
export type OfferKind = OfferResponse['kind'];
export type OfferStatus = OfferResponse['status'];
export type OfferRole = OfferResponse['viewerRole'];
export type OfferAction = OfferResponse['allowedActions'][number];
export type CreateOfferRequest = Schemas['CreateOfferRequest'];
export type CounterOfferRequest = Schemas['CounterOfferRequest'];
export type OfferTradeItemRequest = Schemas['OfferTradeItemRequest'];
export type OfferSettings = Schemas['OfferSettings'];
export type TradeResponse = Schemas['TradeResponse'];
export type TradeSummary = Schemas['TradeSummary'];
export type TradePage = Schemas['CursorPageTradeSummary'];
export type TradeEvent = Schemas['TradeEvent'];
export type TradeNextAction = Schemas['TradeNextAction'];
export type TradeStatus = TradeResponse['status'];
export type TradeOperation = TradeResponse['allowedOperations'][number];

// --- Payment protection and disputes (Phase 9) --------------------------------------------------
export type PaymentSummary = Schemas['PaymentSummary'];
export type ShipmentSummary = Schemas['ShipmentSummary'];
export type DisputeSummary = Schemas['DisputeSummary'];
export type ProtectedPayment = Schemas['ProtectedPayment'];
export type ShipTradeRequest = Schemas['ShipTradeRequest'];
export type OpenDisputeRequest = Schemas['OpenDisputeRequest'];
export type Dispute = Schemas['Dispute'];
export type DisputeEvidence = Schemas['DisputeEvidence'];
export type DisputeMessage = Schemas['DisputeMessage'];
export type DisputeEvent = Schemas['DisputeEvent'];
export type SellerAccount = Schemas['SellerAccount'];
export type SellerOnboarding = Schemas['SellerOnboarding'];
export type FakeCheckout = Schemas['FakeCheckout'];

// --- Premium, credits, ads and donations (Phase 10) ---------------------------------------------
export type Plan = Schemas['Plan'];
export type PlanLimit = Schemas['PlanLimit'];
export type PlanFeature = Schemas['PlanFeature'];
export type MySubscription = Schemas['MySubscription'];
export type MyEntitlement = Schemas['MyEntitlement'];
export type SubscriptionCheckout = Schemas['SubscriptionCheckout'];
export type FakeBillingCheckout = Schemas['FakeBillingCheckout'];
export type MyCredits = Schemas['MyCredits'];
export type CreditEntry = Schemas['CreditEntry'];
export type CreditProduct = Schemas['CreditProduct'];
export type CreditSpend = Schemas['CreditSpend'];
export type MyReferral = Schemas['MyReferral'];
export type ReferralRedemption = Schemas['ReferralRedemption'];
export type Ad = Schemas['Ad'];
export type AdPlacement = NonNullable<Ad['placement']>;
export type DonationCheckoutRequest = Schemas['DonationCheckoutRequest'];
export type DonationCheckout = Schemas['DonationCheckout'];
export type Donation = Schemas['Donation'];
export type FakeDonationCheckout = Schemas['FakeDonationCheckout'];
export type Supporters = Schemas['Supporters'];
export type Supporter = Schemas['Supporter'];
