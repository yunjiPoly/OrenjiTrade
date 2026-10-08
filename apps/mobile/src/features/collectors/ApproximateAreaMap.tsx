import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import type { PublicPoint } from '@/src/api/types';
import { CollectorMap } from '@/src/components/map/CollectorMap';
import type { CollectorZone, InitialCamera } from '@/src/components/map/CollectorMap.types';
import { APPROXIMATE_AREA_RADIUS_M, round3, zoneFitZoom } from '@/src/lib/approximateArea';

/**
 * Height of the profile's map (dp): at zoom 13 the whole 3 km zone (about 225 dp at 45.5° N)
 * fits with a margin; further north the zoom steps out instead of clipping the zone.
 */
export const AREA_MAP_HEIGHT = 260;

const noop = () => undefined;

export interface ApproximateAreaMapProps {
  point: PublicPoint;
  /** Accessible name of the map. */
  label: string;
}

/**
 * A collector's approximate area on their profile (the web's `approximate-area-map`): the same
 * zone of radius 1500 m around the public point as on the Map tab, shown at the closest zoom where
 * the whole zone fits the map (13 around Montréal, never past the cap of 14), still inside the
 * scrolling profile (no gestures, no taps).
 */
export function ApproximateAreaMap({ point, label }: ApproximateAreaMapProps) {
  const center = useMemo(() => ({ lat: round3(point.lat), lng: round3(point.lng) }), [point]);
  const zones = useMemo<CollectorZone[]>(
    () => [
      {
        id: 'area',
        center,
        radiusMeters: APPROXIMATE_AREA_RADIUS_M,
        selected: true,
        self: false,
        label,
      },
    ],
    [center, label]
  );
  const initialCamera = useMemo<InitialCamera>(
    () => ({ center, zoom: zoneFitZoom(center.lat, AREA_MAP_HEIGHT) }),
    [center]
  );
  return (
    <View style={styles.box} testID="collector-area-map">
      <CollectorMap
        zones={zones}
        clusters={[]}
        initialCamera={initialCamera}
        camera={null}
        onViewportChange={noop}
        onZonePress={noop}
        onClusterPress={noop}
        interactive={false}
        accessibilityLabel={label}
        errorMessage="The area is described below."
        testID="collector-area"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: AREA_MAP_HEIGHT,
    // Rounded clipping only on web: on Android, a Google map inside a parent that clips with a
    // border radius renders an empty grey surface.
    ...(Platform.OS === 'web' ? { borderRadius: 12, overflow: 'hidden' as const } : {}),
  },
});
