import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_DEFAULT, type Region } from 'react-native-maps';

import { useAppStore } from '@/src/store/useAppStore';
import { useTheme } from '@/src/theme';

import { MONTREAL_REGION } from './constants';
import { LeafletBrowseMap } from './LeafletBrowseMap';
import { MapErrorBoundary } from './MapErrorBoundary';
import { currentMapEngine } from './mapEngine';
import { MapOverlay } from './MapOverlay';
import { MapPlaceholder } from './MapPlaceholder';

function NativeMap() {
  const { scheme } = useTheme();
  const lastMapRegion = useAppStore((state) => state.lastMapRegion);
  const setLastMapRegion = useAppStore((state) => state.setLastMapRegion);
  const [initialRegion] = useState<Region>(() => lastMapRegion ?? MONTREAL_REGION);

  const onRegionChangeComplete = useCallback(
    (region: Region) => {
      setLastMapRegion({
        latitude: region.latitude,
        longitude: region.longitude,
        latitudeDelta: region.latitudeDelta,
        longitudeDelta: region.longitudeDelta,
      });
    },
    [setLastMapRegion]
  );

  return (
    <MapView
      testID="collector-map"
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      initialRegion={initialRegion}
      onRegionChangeComplete={onRegionChangeComplete}
      userInterfaceStyle={scheme}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsPointsOfInterests={false}
      toolbarEnabled={false}
      accessibilityLabel={MAP_LABEL}
    />
  );
}

const MAP_LABEL = 'Map of approximate collector locations';

/**
 * Map tab body centred on the last viewport (Montréal at first) with the Phase 4 overlay: Apple or
 * Google Maps (react-native-maps), or Leaflet + OpenStreetMap in a WebView where Google Maps cannot
 * draw (Expo Go on Android, no project key; see `mapEngine`).
 */
export function CollectorMap() {
  const [engine] = useState(currentMapEngine);
  const [unavailable, setUnavailable] = useState(false);
  const markUnavailable = useCallback(() => setUnavailable(true), []);
  const placeholder = <MapPlaceholder reason="unavailable" />;
  return (
    <View style={styles.container} testID="collector-map-container">
      {unavailable ? (
        placeholder
      ) : (
        <MapErrorBoundary name="CollectorMap" fallback={placeholder}>
          {engine === 'native' ? (
            <NativeMap />
          ) : (
            <LeafletBrowseMap onUnavailable={markUnavailable} accessibilityLabel={MAP_LABEL} />
          )}
        </MapErrorBoundary>
      )}
      <MapOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
