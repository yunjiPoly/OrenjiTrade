import { useRouter } from 'expo-router';
import { useRef } from 'react';

import { useSnackbar } from '@/src/components/ui/Snackbar';

import { SCAN_COPY } from './scanCopy';
import { pickScanPhotos } from './scanPhotos';
import { REVIEW_FROM_PHOTOS, SCAN_CAMERA_ROUTE, SCAN_REVIEW_ROUTE } from './scanRoutes';
import { scanRunner } from './scanRunner';
import { useCardScanAvailability } from './useCardScanAvailability';

export interface AddCardsScanRows {
  /** "Scan with camera": a new scan, on the camera (27). */
  onCamera: () => void;
  /**
   * "Choose from photos": the photo picker (up to 50, one card per photo), then the review (30),
   * which shows "Reading 3 of 12…" and fills in as each photo is matched.
   */
  onPhotos: () => void;
}

/**
 * The two rows Add cards shows for the card scan (owner spec 2026-10-15, screen 26), or null where
 * the scan is not available (the flag `cardTextScan` off, or a build without the reader: Expo Go,
 * the web), so R2's "Coming later" row stays. Each row starts a new scan.
 */
export function useAddCardsScanRows(): AddCardsScanRows | null {
  const router = useRouter();
  const snackbar = useSnackbar();
  const { available } = useCardScanAvailability();
  const picking = useRef(false);
  if (!available) {
    return null;
  }
  return {
    onCamera: () => {
      scanRunner.endScan();
      router.push(SCAN_CAMERA_ROUTE);
    },
    onPhotos: () => {
      if (picking.current) {
        return;
      }
      picking.current = true;
      void pickScanPhotos()
        .then((picked) => {
          if (!picked || picked.length === 0) {
            return; // Cancelled: Add cards stays.
          }
          scanRunner.endScan();
          scanRunner.addPhotos(picked);
          router.push({ pathname: SCAN_REVIEW_ROUTE, params: { from: REVIEW_FROM_PHOTOS } });
        })
        .catch(() => snackbar.show(SCAN_COPY.photosFailed, { tone: 'error' }))
        .finally(() => {
          picking.current = false;
        });
    },
  };
}
