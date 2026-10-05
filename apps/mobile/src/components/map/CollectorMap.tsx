import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_DEFAULT, type Region } from 'react-native-maps';

import { useAppStore } from '@/src/store/useAppStore';
import { useTheme } from '@/src/theme';

import { MONTREAL_REGION } from './constants';
import { MapErrorBoundary } from './MapErrorBoundary';
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
      accessibilityLabel="Map of approximate collector locations"
    />
  );
}

/** Map tab body: native map centred on Montréal with the Phase 4 overlay. */
export function CollectorMap() {
  return (
    <View style={styles.container} testID="collector-map-container">
      <MapErrorBoundary name="CollectorMap" fallback={<MapPlaceholder reason="unavailable" />}>
        <NativeMap />
      </MapErrorBoundary>
      <MapOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
