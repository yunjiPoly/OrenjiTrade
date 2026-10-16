/**
 * PLACEHOLDER (card scan batch B2a). Part B builds the search inside the scan here ("Search by name
 * or code" from 28, 29, 30 and the printing list, owner spec 2026-10-15, section 4): it opens with
 * what was read (`tileId` names the tile), shows cards and exact printings from /cards/suggest, and
 * its pick fixes the tile without leaving the scan. Until then this page shows what was read and
 * leads back.
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { EmptyState } from '@/src/components/ui/EmptyState';
import { SCAN_COPY } from '@/src/features/scan/scanCopy';
import { ScanGateFrame } from '@/src/features/scan/ScanGateFrame';
import { readText } from '@/src/features/scan/scanPrintings';
import { findTile } from '@/src/features/scan/scanSession';
import { useScanStore } from '@/src/features/scan/scanStore';

export default function ScanSearchPlaceholder() {
  const router = useRouter();
  const { tileId } = useLocalSearchParams<{ tileId?: string }>();
  const tile = useScanStore((state) => (tileId ? findTile(state.session, tileId) : null));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/scan'));
  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: SCAN_COPY.searchByNameOrCode }} />
      <ScanGateFrame onClose={back} testID="screen-scan-search">
        <EmptyState
          icon="magnify"
          title={SCAN_COPY.searchByNameOrCode}
          description={readText(tile?.read ?? null)}
          actionLabel="Back to scanning"
          onAction={back}
          testID="scan-search-placeholder"
        />
      </ScanGateFrame>
    </>
  );
}
