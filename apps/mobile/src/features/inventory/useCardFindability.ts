import { useAccount } from '@/src/account/AccountProvider';
import { useListingStatus } from '@/src/api/hooks/inventory';
import { usePrivacySettings } from '@/src/api/hooks/location';
import { isRegionCode, regionName } from '@/src/lib/place';

import type { CardFindability } from './visibilityStatus';

/**
 * What decides whether collectors can find the owner's public cards, for the hint under "Who can
 * see it" of Add to inventory and Edit card (review fix 1 of stage R2): the region of the declared
 * location (`/me`), "Show me on the map" and the profile visibility (privacy settings), and a
 * pause of the public cards (listing status). Unknown parts stay `null`.
 */
export function useCardFindability(): CardFindability {
  const me = useAccount().me;
  const privacy = usePrivacySettings();
  const listing = useListingStatus();
  const home = me?.homeRegion;
  return {
    regionName: isRegionCode(home) ? regionName(home) : null,
    located: me ? me.onboarding.locationSet || !!home : null,
    discoverable: privacy.data ? privacy.data.discoverable : null,
    privateProfile: privacy.data ? privacy.data.profileVisibility === 'PRIVATE' : null,
    paused: listing.data ? listing.data.paused : null,
  };
}
