import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ErrorState } from '@/src/components/ui/ErrorState';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { radius, useTheme } from '@/src/theme';

import { TRADING_AREA_MAP_HEIGHT } from './TradingAreaMap.types';

export type MapLoadState = 'loading' | 'ready' | 'error';

export interface TradingAreaMapFrameProps {
  state: MapLoadState;
  onRetry: () => void;
  children: ReactNode;
}

/**
 * The map's box with its loading skeleton and its error state with retry (web: "The map could not
 * load" + "Reload map"). The pickers below the map keep working when it fails.
 */
export function TradingAreaMapFrame({ state, onRetry, children }: TradingAreaMapFrameProps) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.frame,
        { borderColor: palette.border, backgroundColor: palette.surfaceVariant },
      ]}
      aria-busy={state === 'loading'}
    >
      {children}
      {state === 'loading' ? (
        <View style={styles.overlay} pointerEvents="none" testID="trading-area-map-loading">
          <Skeleton width="100%" height={TRADING_AREA_MAP_HEIGHT} radius={0} />
        </View>
      ) : null}
      {state === 'error' ? (
        <View style={[styles.overlay, { backgroundColor: palette.surfaceVariant }]}>
          <ErrorState
            compact
            title="The map could not load"
            message="You can still pick a city or use your location below."
            retryLabel="Reload map"
            onRetry={onRetry}
            testID="trading-area-map-error"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: TRADING_AREA_MAP_HEIGHT,
    borderWidth: 1,
    // Rounded clipping only on web: on Android, a Google map inside a parent that clips with a
    // border radius renders an empty grey surface (no tiles, no pin, no circle).
    ...(Platform.OS === 'web' ? { borderRadius: radius.md, overflow: 'hidden' as const } : {}),
  },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'center' },
});
