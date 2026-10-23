import type { PrivacySettings } from '@/src/api/types';

/**
 * Whether others see the collector on the map and in searches, as the API decides it
 * (`PublicVisibilityRules.OWNER_LISTED`): a saved place, "Show me on the map" on and a profile
 * that is not PRIVATE. A PRIVATE profile leaves the map and the searches whatever the switch says
 * (stage R13's review fix 1: Settings and Location said "On the map" for a private profile).
 */
export type MapStatus = 'no-place' | 'on-map' | 'hidden' | 'private';

export function mapStatus(
  hasPlace: boolean,
  privacy: Pick<PrivacySettings, 'discoverable' | 'profileVisibility'>
): MapStatus {
  if (!hasPlace) {
    return 'no-place';
  }
  if (!privacy.discoverable) {
    return 'hidden';
  }
  return privacy.profileVisibility === 'PRIVATE' ? 'private' : 'on-map';
}
