import { useCallback } from 'react';
import { Platform, Share } from 'react-native';

import { useSnackbar } from '@/src/components/ui/Snackbar';
import { afterModals } from '@/src/components/ui/modalTurns';

import { PROFILE_COPY } from './profileCopy';
import { profileUrl } from './profileRules';

/**
 * "Share profile" (mockup screens 19 to 21): the system's share sheet with the profile's public
 * link (`https://www.orenjitrade.com/collectors/{handle}`, a universal link of the app). A browser
 * without a share sheet (the web build) shows the link in a snackbar instead. Waits for a closing
 * sheet first, until iOS has dismissed it ("⋯" › Share profile): iOS would take the share sheet
 * away with it (`afterModals`).
 */
export function useShareProfile() {
  const snackbar = useSnackbar();
  return useCallback(
    async (profile: { handle: string; displayName: string }) => {
      const url = profileUrl(profile.handle);
      await afterModals();
      try {
        await Share.share(
          Platform.OS === 'ios'
            ? { message: `${profile.displayName} on OrenjiTrade`, url }
            : { message: PROFILE_COPY.shareMessage(profile.displayName, url) }
        );
      } catch {
        snackbar.show(PROFILE_COPY.shareFallback(url), { duration: 8000 });
      }
    },
    [snackbar]
  );
}
