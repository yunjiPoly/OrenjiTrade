import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, {
  Circle,
  Marker,
  PROVIDER_DEFAULT,
  type MapPressEvent,
  type MarkerDragStartEndEvent,
  type Region,
} from 'react-native-maps';

import { MapErrorBoundary } from '@/src/components/map/MapErrorBoundary';
import { regionForArea } from '@/src/lib/location';
import { useTheme } from '@/src/theme';

import {
  PIN_TITLE,
  TRADING_AREA_MAP_LABEL,
  withAlpha,
  type TradingAreaMapProps,
} from './TradingAreaMap.types';
import { TradingAreaMapFrame, type MapLoadState } from './TradingAreaMapFrame';

/**
 * Trading-area map with react-native-maps (`mapEngine` "native": Apple Maps on iOS, Google Maps on
 * Android in a build with the project's own key): tap the map or long-press and drag the pin to
 * move the centre. The device's own position is never shown (`showsUserLocation` stays off,
 * ADR 0004).
 */
export function TradingAreaMapNative(props: TradingAreaMapProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<MapLoadState>('loading');
  return (
    <TradingAreaMapFrame
      state={state}
      onRetry={() => {
        setState('loading');
        setAttempt((current) => current + 1);
      }}
    >
      <MapErrorBoundary
        key={attempt}
        name="TradingAreaMap"
        fallback={<FailedMap onFailed={() => setState('error')} />}
      >
        <NativeAreaMap {...props} onReady={() => setState('ready')} />
      </MapErrorBoundary>
    </TradingAreaMapFrame>
  );
}

function FailedMap({ onFailed }: { onFailed: () => void }) {
  useEffect(() => onFailed(), [onFailed]);
  return null;
}

function NativeAreaMap({
  centre,
  radiusKm,
  focus,
  onPick,
  onViewportChange,
  disabled,
  testID = 'trading-area-map',
  onReady,
}: TradingAreaMapProps & { onReady: () => void }) {
  const { palette, scheme } = useTheme();
  const mapRef = useRef<MapView>(null);
  const [initialRegion] = useState<Region>(() => regionForArea(focus, focus.radiusKm));

  // A new focus (a city, a reset area) moves the camera; taps and drags never do (like the web).
  const { lat, lng, radiusKm: focusRadius, seq } = focus;
  useEffect(() => {
    if (seq === 0) {
      return;
    }
    const map: Partial<Pick<MapView, 'animateToRegion'>> | null = mapRef.current;
    if (typeof map?.animateToRegion === 'function') {
      map.animateToRegion(regionForArea({ lat, lng }, focusRadius), 350);
    }
  }, [lat, lng, focusRadius, seq]);

  const pick = (coordinate: { latitude: number; longitude: number }) => {
    if (!disabled) {
      onPick({ lat: coordinate.latitude, lng: coordinate.longitude });
    }
  };

  return (
    // The wrapper carries the test id: a stable tap target for the Maestro flows on Android.
    <View style={StyleSheet.absoluteFill} testID={testID} collapsable={false}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        onMapReady={onReady}
        onPress={(event: MapPressEvent) => pick(event.nativeEvent.coordinate)}
        onRegionChangeComplete={(region: Region) =>
          onViewportChange({ lat: region.latitude, lng: region.longitude })
        }
        userInterfaceStyle={scheme}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsIndoors={false}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        accessibilityLabel={TRADING_AREA_MAP_LABEL}
      >
        {centre ? (
          <>
            <Circle
              center={{ latitude: centre.lat, longitude: centre.lng }}
              radius={radiusKm * 1000}
              strokeColor={palette.primary}
              strokeWidth={2}
              fillColor={withAlpha(palette.primary, 0.12)}
            />
            <Marker
              testID="trading-area-pin"
              coordinate={{ latitude: centre.lat, longitude: centre.lng }}
              title={PIN_TITLE}
              pinColor={palette.primary}
              draggable={!disabled}
              onDragEnd={(event: MarkerDragStartEndEvent) => pick(event.nativeEvent.coordinate)}
            />
          </>
        ) : null}
      </MapView>
    </View>
  );
}
