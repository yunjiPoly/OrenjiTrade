import { Stack } from 'expo-router';

import { ScanReviewScreen } from '@/src/features/scan/ScanReviewScreen';

/**
 * Review (mockup screen 30): the scan's cards, their quick fixes, and "Add {n} cards to inventory".
 * Opened by the camera's "Review {n}", or by Add cards' "Choose from photos" (`from=photos`).
 */
export default function ScanReviewRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: 'Review' }} />
      <ScanReviewScreen />
    </>
  );
}
