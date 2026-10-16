/**
 * PLACEHOLDER (card scan batch B2a). Part B builds screen 30 here: the review ("Back to scanning",
 * "Review {n} cards", the groups, the pills and "Add {n} cards to inventory", owner spec 2026-10-15,
 * section 4). Until then this page only says what the scan holds and leads back to the camera.
 */
import { Stack, useRouter } from 'expo-router';

import { EmptyState } from '@/src/components/ui/EmptyState';
import { reviewSummary, reviewTitle } from '@/src/features/scan/scanCopy';
import { ScanGateFrame } from '@/src/features/scan/ScanGateFrame';
import { scanCounts } from '@/src/features/scan/scanSession';
import { useScanStore } from '@/src/features/scan/scanStore';

export default function ScanReviewPlaceholder() {
  const router = useRouter();
  const counts = scanCounts(useScanStore((state) => state.session));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/scan'));
  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: reviewTitle(counts) }} />
      <ScanGateFrame onClose={back} testID="screen-scan-review">
        <EmptyState
          icon="cards-outline"
          title={reviewTitle(counts)}
          description={reviewSummary(counts)}
          actionLabel="Back to scanning"
          onAction={back}
          testID="scan-review-placeholder"
        />
      </ScanGateFrame>
    </>
  );
}
