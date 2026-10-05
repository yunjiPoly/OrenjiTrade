import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import MapView, {
  Circle,
  Marker,
  PROVIDER_DEFAULT,
  type MapPressEvent,
  type Region,
} from 'react-native-maps';

import { withAlpha } from '@/src/features/location/TradingAreaMap.types';
import { COLLECTOR_MAP_MAX_ZOOM, COLLECTOR_MAP_MIN_ZOOM } from '@/src/lib/approximateArea';
import {
  regionBeyondCap,
  regionForCamera,
  regionForTarget,
  viewportOfRegion,
  zoneAt,
  type MapSize,
} from '@/src/lib/mapGeometry';
import { fontWeight, useTheme } from '@/src/theme';

import { ZONE_STYLE, type CollectorMapProps, type CollectorZone } from './CollectorMap.types';
import type { EngineCallbacks } from './CollectorMapLeaflet';

const ANIMATION_MS = 350;

/**
 * The collector map with react-native-maps (`mapEngine` "native": Apple Maps on iOS, Google Maps
 * on Android in a build with the project's own key). Collectors are `Circle`s of radius 1500 m
 * around their public point; there is no `Marker` at any collector's point (count bubbles of
 * clusters are the only markers, at the average of several points). Zoom: `maxZoomLevel` 14 for
 * gestures, every requested region clamped to 14 (`regionForTarget`), and a guard that pulls the
 * camera back if anything still goes past the cap. The device position is never shown.
 */
export function CollectorMapNative({
  zones,
  clusters,
  initialCamera,
  camera,
  onViewportChange,
  onZonePress,
  onClusterPress,
  onEmptyPress,
  accessibilityLabel,
  testID = 'collector-map',
  onReady,
  interactive = true,
}: CollectorMapProps & EngineCallbacks) {
  const { palette, scheme } = useTheme();
  const screenSize = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const size = useRef<MapSize>({ width: screenSize.width, height: screenSize.height });
  const zoom = useRef(initialCamera.zoom);
  const [initialRegion] = useState<Region>(() =>
    regionForCamera(initialCamera.center, initialCamera.zoom, {
      width: screenSize.width,
      height: screenSize.height,
    })
  );

  const animate = (region: Region) => {
    const map: Partial<Pick<MapView, 'animateToRegion'>> | null = mapRef.current;
    if (typeof map?.animateToRegion === 'function') {
      map.animateToRegion(region, ANIMATION_MS);
    }
  };

  const seq = camera?.seq ?? 0;
  const lastSeq = useRef(0);
  useEffect(() => {
    if (!camera || seq === lastSeq.current) {
      return;
    }
    lastSeq.current = seq;
    animate(
      regionForTarget(
        camera.kind === 'center'
          ? { kind: 'center', center: camera.center, zoom: camera.zoom }
          : { kind: 'bounds', bounds: camera.bounds },
        size.current
      )
    );
  }, [camera, seq]);

  const onRegionChangeComplete = (region: Region) => {
    const back = regionBeyondCap(region, size.current);
    if (back) {
      // A gesture or the platform went past the cap: back to 14, reported once it settles there.
      animate(back);
      return;
    }
    const viewport = viewportOfRegion(region, size.current.width);
    zoom.current = viewport.zoom;
    onViewportChange(viewport);
  };

  const onPress = (event: MapPressEvent) => {
    if (!interactive || event.nativeEvent.action === 'marker-press') {
      return;
    }
    const { latitude, longitude } = event.nativeEvent.coordinate;
    const zone = zoneAt(zones, { lat: latitude, lng: longitude }, zoom.current);
    if (zone) {
      onZonePress(zone.id);
    } else {
      onEmptyPress?.();
    }
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      size.current = { width, height };
    }
  };

  const zoneColour = (zone: CollectorZone) =>
    zone.selected ? palette.onPrimaryContainer : zone.self ? palette.accent : palette.primary;

  return (
    // The wrapper carries the test id: a stable tap target for the Maestro flows on Android.
    <View style={StyleSheet.absoluteFill} testID={testID} collapsable={false} onLayout={onLayout}>
      <MapView
        ref={mapRef}
        testID={`${testID}-view`}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        minZoomLevel={COLLECTOR_MAP_MIN_ZOOM}
        maxZoomLevel={COLLECTOR_MAP_MAX_ZOOM}
        onMapReady={onReady}
        onPress={onPress}
        onRegionChangeComplete={onRegionChangeComplete}
        userInterfaceStyle={scheme}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsIndoors={false}
        pitchEnabled={false}
        rotateEnabled={false}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        zoomTapEnabled={interactive}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        accessibilityLabel={accessibilityLabel}
      >
        {zones.map((zone) => (
          <Circle
            key={`zone-${zone.id}`}
            testID={`zone-${zone.id}`}
            center={{ latitude: zone.center.lat, longitude: zone.center.lng }}
            radius={zone.radiusMeters}
            strokeColor={withAlpha(zoneColour(zone), ZONE_STYLE.strokeOpacity)}
            strokeWidth={zone.selected ? ZONE_STYLE.selectedStrokeWidth : ZONE_STYLE.strokeWidth}
            fillColor={withAlpha(
              zoneColour(zone),
              zone.selected ? ZONE_STYLE.selectedFillOpacity : ZONE_STYLE.fillOpacity
            )}
            zIndex={zone.selected ? 2 : 1}
          />
        ))}
        {clusters.map((cluster) => (
          <Marker
            key={`cluster-${cluster.id}`}
            testID={`cluster-${cluster.id}`}
            coordinate={{ latitude: cluster.center.lat, longitude: cluster.center.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            accessibilityLabel={cluster.label}
            onPress={() => onClusterPress(cluster.id)}
          >
            <View
              style={[
                styles.bubble,
                { backgroundColor: palette.primary, borderColor: palette.onPrimary },
              ]}
            >
              <Text style={[styles.count, { color: palette.onPrimary }]}>{cluster.count}</Text>
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { fontSize: 14, fontWeight: fontWeight.semibold },
});
