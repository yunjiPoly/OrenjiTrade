import { onlineManager } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

import { tileAnnouncement } from './scanCopy';
import { scanRunner as appScanRunner, type ScanRunner } from './scanRunner';

/**
 * What a screen of the scan (the camera, the review) keeps running while it is on screen:
 *
 * - the tiles waiting for the connection are matched again by themselves ("Waiting for
 *   connection" resolves when the connection is back): as soon as the phone is online again, when
 *   the screen comes back or the app returns to the front, and on a timer that waits longer each
 *   time while the screen is open (the phone can stay online while the API cannot be reached);
 * - each photo's result is said by the screen reader when it lands in the tray ("Ash Blossom &
 *   Joyous Spring, found"), by the screen on top only (the camera stays under the review);
 * - the photo files of a scan an earlier run of the app lost (closed before the scan ended) are
 *   deleted.
 */
export function useScanEffects(runner: ScanRunner = appScanRunner): void {
  const focused = useRef(true);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      // Back on a scan screen: the tiles that wait for the connection are tried again.
      void runner.retryWaiting();
      return () => {
        focused.current = false;
      };
    }, [runner])
  );
  useEffect(() => {
    void runner.sweepLeftovers();
  }, [runner]);
  useEffect(() => runner.watchWaiting(), [runner]);
  useEffect(
    () =>
      onlineManager.subscribe((online) => {
        if (online) {
          void runner.retryWaiting();
        }
      }),
    [runner]
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        void runner.retryWaiting();
      }
    });
    return () => subscription.remove();
  }, [runner]);
  useEffect(
    () =>
      runner.onLanded((tile) => {
        if (focused.current) {
          AccessibilityInfo.announceForAccessibility(tileAnnouncement(tile));
        }
      }),
    [runner]
  );
}
