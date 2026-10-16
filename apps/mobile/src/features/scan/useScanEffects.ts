import { onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

import { tileAnnouncement } from './scanCopy';
import { scanRunner as appScanRunner, type ScanRunner } from './scanRunner';

/**
 * What a screen of the scan (the camera, the review) keeps running while it is on screen:
 *
 * - the tiles waiting for the connection are matched again as soon as the phone is online again
 *   ("Waiting for connection" resolves by itself);
 * - each photo's result is said by the screen reader when it lands in the tray ("Ash Blossom &
 *   Joyous Spring, found");
 * - the photo files of a scan an earlier run of the app lost (closed before the scan ended) are
 *   deleted.
 */
export function useScanEffects(runner: ScanRunner = appScanRunner): void {
  useEffect(() => {
    void runner.sweepLeftovers();
  }, [runner]);
  useEffect(
    () =>
      onlineManager.subscribe((online) => {
        if (online) {
          void runner.retryWaiting();
        }
      }),
    [runner]
  );
  useEffect(
    () =>
      runner.onLanded((tile) => {
        AccessibilityInfo.announceForAccessibility(tileAnnouncement(tile));
      }),
    [runner]
  );
}
