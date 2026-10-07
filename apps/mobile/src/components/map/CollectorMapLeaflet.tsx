import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { clampZoom } from '@/src/lib/approximateArea';
import { zoneAt } from '@/src/lib/mapGeometry';
import { useTheme } from '@/src/theme';

import type { CollectorMapProps } from './CollectorMap.types';
import {
  collectorMapPageHtml,
  layerScript,
  pageLayer,
  parseCollectorPageMessage,
  viewScript,
} from './leaflet/collectorMapPage';
import { PAGE_BASE_URL, shouldStartLoad } from './leaflet/webViewNavigation';

/** The page reports `ready` within this time, or the map counts as unavailable. */
export const COLLECTOR_MAP_READY_TIMEOUT_MS = 20_000;

export interface EngineCallbacks {
  onReady: () => void;
  onFailed: () => void;
  /** Taps report zones (false for a map that only shows, like the profile's). */
  interactive?: boolean;
}

/**
 * The collector map with Leaflet + OpenStreetMap in a WebView (`mapEngine` "leaflet": Android in
 * Expo Go or without the project's Google Maps key). Zones are circles of radius 1500 m drawn by
 * the page, never markers; the page and every camera request stop at zoom 14; a tap is matched to
 * the nearest zone here, and its position is not kept.
 */
export function CollectorMapLeaflet({
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
  onFailed,
  interactive = true,
}: CollectorMapProps & EngineCallbacks) {
  const { palette } = useTheme();
  // react-native-webview 14 declares `class WebView<P = undefined>` with `WebViewProps & P` props,
  // so the default makes them `never`; `WebView<object>` is the plain WebView.
  const webView = useRef<WebView<object>>(null);
  const [ready, setReady] = useState(false);
  const [html] = useState(() =>
    collectorMapPageHtml({
      start: { center: initialCamera.center, zoom: clampZoom(initialCamera.zoom) },
      colors: {
        zone: palette.primary,
        selected: palette.onPrimaryContainer,
        self: palette.accent,
        cluster: palette.primary,
        clusterText: palette.onPrimary,
        background: palette.surfaceVariant,
      },
      label: accessibilityLabel,
      interactive,
    })
  );
  // Latest values for the message handler.
  const live = useRef({ zones, zoom: clampZoom(initialCamera.zoom) });
  useEffect(() => {
    live.current.zones = zones;
  }, [zones]);

  useEffect(() => {
    if (ready) {
      return;
    }
    const timer = setTimeout(onFailed, COLLECTOR_MAP_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready, onFailed]);

  // The layer follows the zones and bubbles.
  useEffect(() => {
    if (ready) {
      webView.current?.injectJavaScript(layerScript(pageLayer(zones, clusters)));
    }
  }, [ready, zones, clusters]);

  // A new camera request moves the map once (clamped to the cap).
  const seq = camera?.seq ?? 0;
  const lastSeq = useRef(0);
  useEffect(() => {
    if (!ready || !camera || seq === lastSeq.current) {
      return;
    }
    lastSeq.current = seq;
    webView.current?.injectJavaScript(
      viewScript(
        camera.kind === 'center'
          ? { kind: 'center', center: camera.center, zoom: camera.zoom }
          : { kind: 'bounds', bounds: camera.bounds }
      )
    );
  }, [ready, camera, seq]);

  const onMessage = (event: WebViewMessageEvent) => {
    const message = parseCollectorPageMessage(event.nativeEvent.data);
    if (!message) {
      return;
    }
    switch (message.type) {
      case 'ready':
        setReady(true);
        onReady();
        break;
      case 'error':
        onFailed();
        break;
      case 'viewport':
        live.current.zoom = message.zoom;
        onViewportChange({
          center: { lat: message.lat, lng: message.lng },
          zoom: message.zoom,
          bounds: {
            north: message.north,
            south: message.south,
            east: message.east,
            west: message.west,
          },
        });
        break;
      case 'tap': {
        if (!interactive) {
          break;
        }
        const zone = zoneAt(live.current.zones, message, message.zoom);
        if (zone) {
          onZonePress(zone.id);
        } else {
          onEmptyPress?.();
        }
        break;
      }
      case 'cluster':
        onClusterPress(message.id);
        break;
    }
  };

  return (
    <WebView<object>
      ref={webView}
      testID={testID}
      style={styles.web}
      source={{ html, baseUrl: PAGE_BASE_URL }}
      originWhitelist={['https://*', 'about:blank', 'data:*']}
      onMessage={onMessage}
      onShouldStartLoadWithRequest={shouldStartLoad}
      onError={onFailed}
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
