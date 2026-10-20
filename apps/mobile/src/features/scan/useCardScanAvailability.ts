import { FEATURE, useFeature } from '@/src/api/hooks/featureFlags';

import { isDeviceOcrAvailable } from './ocr/deviceOcr';

/**
 * Whether "Add cards" offers the scan (spec 4, screen 26): the flag `cardTextScan` is on for this
 * collector AND this build has the text reader. In Expo Go, on the web and with the flag off, R2's
 * "Coming later" row stays. `known` is false only while the flag is still being read on a build
 * that has the reader.
 */
export function useCardScanAvailability(): { available: boolean; known: boolean } {
  const flag = useFeature(FEATURE.cardTextScan);
  const reader = isDeviceOcrAvailable();
  return { available: reader && flag.enabled, known: !reader || flag.known };
}
