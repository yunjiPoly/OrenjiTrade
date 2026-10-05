import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { CollectorMapComponentProps } from './CollectorMap.types';
import { CollectorMapFrame, type CollectorMapState } from './CollectorMapFrame';
import { CollectorMapLeaflet } from './CollectorMapLeaflet';
import { CollectorMapNative } from './CollectorMapNative';
import { MapErrorBoundary } from './MapErrorBoundary';
import { currentMapEngine } from './mapEngine';

/**
 * The collector map on iOS and Android, behind the app's map adapter choice (`mapEngine`,
 * ADR 0010): react-native-maps with Apple Maps on iOS and Google Maps on Android builds with the
 * project's key, otherwise Leaflet + OpenStreetMap in a WebView (Expo Go, no key). Loading
 * skeleton and "Reload map" error state around it; the web build uses `CollectorMap.web.tsx`.
 */
export function CollectorMap({
  errorMessage,
  interactive = true,
  testID = 'collector-map',
  ...props
}: CollectorMapComponentProps) {
  const [engine] = useState(currentMapEngine);
  const [state, setState] = useState<CollectorMapState>('loading');
  const [attempt, setAttempt] = useState(0);
  const onReady = useCallback(() => setState('ready'), []);
  const onFailed = useCallback(() => setState('error'), []);

  return (
    <View style={styles.container} testID={`${testID}-container`}>
      <CollectorMapFrame
        state={state}
        errorMessage={errorMessage}
        onRetry={() => {
          setState('loading');
          setAttempt((value) => value + 1);
        }}
      >
        <MapErrorBoundary
          key={attempt}
          name="CollectorMap"
          fallback={<Failed onFailed={onFailed} />}
        >
          {engine === 'native' ? (
            <CollectorMapNative
              {...props}
              testID={testID}
              interactive={interactive}
              onReady={onReady}
              onFailed={onFailed}
            />
          ) : (
            <CollectorMapLeaflet
              {...props}
              testID={testID}
              interactive={interactive}
              onReady={onReady}
              onFailed={onFailed}
            />
          )}
        </MapErrorBoundary>
      </CollectorMapFrame>
    </View>
  );
}

function Failed({ onFailed }: { onFailed: () => void }) {
  useEffect(() => onFailed(), [onFailed]);
  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
