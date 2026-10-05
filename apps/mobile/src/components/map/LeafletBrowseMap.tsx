import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { PAGE_BASE_URL, shouldStartLoad } from '@/src/components/map/leaflet/webViewNavigation';
import { useAppStore } from '@/src/store/useAppStore';
import { useTheme } from '@/src/theme';

import { MONTREAL_REGION } from './constants';
import { parsePageMessage, tradingAreaPageHtml } from './leaflet/tradingAreaPage';

/** Every map that will show other collectors stops at zoom 14 (ADR 0004, 2026-10-04). */
export const COLLECTOR_MAP_MAX_ZOOM = 14;
const KM_PER_DEGREE_LAT = 111.32;
export const BROWSE_MAP_READY_TIMEOUT_MS = 20_000;

export interface LeafletBrowseMapProps {
  /** The page could not load (offline, blocked): the caller shows its placeholder. */
  onUnavailable: () => void;
  accessibilityLabel: string;
  testID?: string;
}

/**
 * The Map tab's map with Leaflet + OpenStreetMap in a WebView (`mapEngine` "leaflet": Android in
 * Expo Go or without the project's Google Maps key): browse only, zoom capped at 14, starting on
 * the last viewport. The page never asks for the device location.
 */
export function LeafletBrowseMap({
  onUnavailable,
  accessibilityLabel,
  testID = 'collector-map',
}: LeafletBrowseMapProps) {
  const { palette } = useTheme();
  const lastMapRegion = useAppStore((state) => state.lastMapRegion);
  const setLastMapRegion = useAppStore((state) => state.setLastMapRegion);
  const [region] = useState(() => lastMapRegion ?? MONTREAL_REGION);
  const [ready, setReady] = useState(false);
  const [html] = useState(() =>
    tradingAreaPageHtml({
      focus: {
        lat: region.latitude,
        lng: region.longitude,
        radiusKm: Math.max(1, (region.latitudeDelta * KM_PER_DEGREE_LAT) / 2),
      },
      color: palette.primary,
      background: palette.surfaceVariant,
      label: accessibilityLabel,
      pinTitle: accessibilityLabel,
      pickable: false,
      maxZoom: COLLECTOR_MAP_MAX_ZOOM,
    })
  );

  useEffect(() => {
    if (ready) {
      return;
    }
    const timer = setTimeout(onUnavailable, BROWSE_MAP_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready, onUnavailable]);

  const onMessage = (event: WebViewMessageEvent) => {
    const message = parsePageMessage(event.nativeEvent.data);
    if (message?.type === 'ready') {
      setReady(true);
    } else if (message?.type === 'error') {
      onUnavailable();
    } else if (message?.type === 'viewport') {
      setLastMapRegion({ ...region, latitude: message.lat, longitude: message.lng });
    }
  };

  return (
    <WebView
      testID={testID}
      style={styles.web}
      source={{ html, baseUrl: PAGE_BASE_URL }}
      originWhitelist={['https://*', 'about:blank', 'data:*']}
      onMessage={onMessage}
      onShouldStartLoadWithRequest={shouldStartLoad}
      onError={onUnavailable}
      javaScriptEnabled
      domStorageEnabled={false}
      geolocationEnabled={false}
      allowFileAccess={false}
      setSupportMultipleWindows={false}
      overScrollMode="never"
      scrollEnabled={false}
      applicationNameForUserAgent="OrenjiTrade"
      accessibilityLabel={accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: 'transparent' },
});
