import { Stack } from 'expo-router';

import { REVIEW_COPY } from '@/src/features/scan/scanCopy';
import { ScanSearchScreen } from '@/src/features/scan/ScanSearchScreen';

/**
 * Search by name or code inside the scan (`tileId` names the tile it fixes): opened by 28, 29, a
 * review row and the printing list; it goes back to where it was opened.
 */
export default function ScanSearchRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: REVIEW_COPY.searchTitle }} />
      <ScanSearchScreen />
    </>
  );
}
