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
