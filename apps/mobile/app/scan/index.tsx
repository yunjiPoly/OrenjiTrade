import { Stack, useRouter } from 'expo-router';

import { FEATURE, useFeatureFlags } from '@/src/api/hooks/featureFlags';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { isDeviceOcrAvailable } from '@/src/features/scan/ocr/deviceOcr';
import { ScanCameraScreen } from '@/src/features/scan/ScanCameraScreen';
import { SCAN_COPY } from '@/src/features/scan/scanCopy';
import { ScanGateFrame } from '@/src/features/scan/ScanGateFrame';
import { ThemeProvider } from '@/src/theme/ThemeProvider';

/**
 * Scan cards (mockup screen 27): the camera and its tray. It opens only where the scan works: the
 * flag `cardTextScan` is on for this collector and this build has the text reader (a development
 * or phone build with the native module `OrenjiTextReader`). Expo Go, the web build and a
 * switched-off flag get a page that says so. The camera screen is dark whatever the theme (its
 * picture is the camera's), like the mockup.
 */
export default function ScanCameraRoute() {
  const router = useRouter();
  const reader = isDeviceOcrAvailable();
  const flags = useFeatureFlags();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/items/new'));

  let body;
  if (!reader || (flags.data && flags.data[FEATURE.cardTextScan] !== true)) {
    body = (
      <ScanGateFrame onClose={leave} testID="screen-scan-unavailable">
        <EmptyState
          icon="camera-off-outline"
          title={SCAN_COPY.unavailableTitle}
          description={reader ? SCAN_COPY.flagOff : SCAN_COPY.readerMissing}
          actionLabel={SCAN_COPY.backToAddCards}
          onAction={leave}
          testID="scan-unavailable"
        />
      </ScanGateFrame>
    );
  } else if (!flags.data && flags.error) {
    body = (
      <ScanGateFrame onClose={leave} testID="screen-scan-flags-error">
        <ErrorState
          error={flags.error}
          title={SCAN_COPY.flagsFailed}
          onRetry={() => void flags.refetch()}
          testID="scan-flags-error"
        />
      </ScanGateFrame>
    );
  } else if (!flags.data) {
    body = (
      <ScanGateFrame onClose={leave} testID="screen-scan-loading">
        <SkeletonList rows={3} rowHeight={82} testID="scan-loading" />
      </ScanGateFrame>
    );
  } else {
    body = <ScanCameraScreen />;
  }

  return (
    <ThemeProvider scheme="dark">
      <Stack.Screen options={{ headerShown: false, title: SCAN_COPY.title }} />
      {body}
    </ThemeProvider>
  );
}
