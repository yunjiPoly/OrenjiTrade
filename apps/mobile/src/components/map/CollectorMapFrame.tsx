import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorState } from '@/src/components/ui/ErrorState';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { useTheme } from '@/src/theme';

export type CollectorMapState = 'loading' | 'ready' | 'error';

export interface CollectorMapFrameProps {
  state: CollectorMapState;
  onRetry: () => void;
  /** Error copy: the Map tab points to its list, the profile to its words. */
  errorMessage?: string;
  children: ReactNode;
  testID?: string;
}

/**
 * Box of a collector map with its loading skeleton and its error state with "Reload map" (the
 * map library or the tiles could not load: offline, blocked). What the screen shows around the map
 * keeps working when it fails.
 */
export function CollectorMapFrame({
  state,
  onRetry,
  errorMessage = 'Collectors are still listed in the List view.',
  children,
  testID = 'collector-map-frame',
}: CollectorMapFrameProps) {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.frame, { backgroundColor: palette.surfaceVariant }]}
      aria-busy={state === 'loading'}
    >
      {state === 'error' ? null : children}
      {state === 'loading' ? (
        <View style={styles.overlay} pointerEvents="none" testID="collector-map-loading">
          <Skeleton radius={0} style={styles.fill} />
        </View>
      ) : null}
      {state === 'error' ? (
        <View style={[styles.overlay, { backgroundColor: palette.surfaceVariant }]}>
          <ErrorState
            compact
            title="The map could not load"
            message={errorMessage}
            retryLabel="Reload map"
            onRetry={onRetry}
            testID="collector-map-error"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  fill: { flex: 1, height: undefined },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'center' },
});
