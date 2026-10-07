import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import {
  applyScript,
  focusScript,
  parsePageMessage,
  tradingAreaPageHtml,
} from '@/src/components/map/leaflet/tradingAreaPage';
import { PAGE_BASE_URL, shouldStartLoad } from '@/src/components/map/leaflet/webViewNavigation';
import { useTheme } from '@/src/theme';

import {
  PIN_TITLE,
  TRADING_AREA_MAP_LABEL,
  type TradingAreaMapProps,
} from './TradingAreaMap.types';
import { TradingAreaMapFrame, type MapLoadState } from './TradingAreaMapFrame';

/** Leaflet must be ready within this time, or the map shows its error state with "Reload map". */
export const MAP_READY_TIMEOUT_MS = 20_000;

/**
 * Trading-area map with Leaflet + OpenStreetMap in a WebView (`mapEngine` "leaflet": Android in
 * Expo Go or without the project's Google Maps key), the web app's fallback adapter: tap the map or
 * drag the pin to move the centre; the radius is drawn as a circle. The page never asks for the
 * device location (geolocation stays off) and a device-derived centre is never drawn (ADR 0004).
 */
export function TradingAreaMapLeaflet({
  centre,
  radiusKm,
  focus,
  onPick,
  onViewportChange,
  disabled = false,
  testID = 'trading-area-map',
}: TradingAreaMapProps) {
  const { palette } = useTheme();
  // react-native-webview 14 declares `class WebView<P = undefined>` with `WebViewProps & P` props,
  // so the default makes them `never`; `WebView<object>` is the plain WebView.
  const webRef = useRef<WebView<object>>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<MapLoadState>('loading');

  // Latest callbacks for the message handler.
  const live = useRef({ onPick, onViewportChange, disabled });
  useEffect(() => {
    live.current = { onPick, onViewportChange, disabled };
  });

  // One document per attempt, starting on the focus of that moment: later changes reach the page
  // through injected scripts, so the map never reloads while the collector uses it.
  const [page, setPage] = useState(() => ({ attempt, html: buildHtml(focus, palette) }));
  if (page.attempt !== attempt) {
    setPage({ attempt, html: buildHtml(focus, palette) });
  }

  useEffect(() => {
    if (state !== 'loading') {
      return;
    }
    const timer = setTimeout(() => setState('error'), MAP_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [state, attempt]);

  // Pin and circle follow the chosen centre and radius.
  const lat = centre?.lat;
  const lng = centre?.lng;
  useEffect(() => {
    if (state !== 'ready') {
      return;
    }
    const area = lat === undefined || lng === undefined ? null : { lat, lng, radiusKm };
    webRef.current?.injectJavaScript(applyScript(area, disabled));
  }, [state, lat, lng, radiusKm, disabled]);

  // A new focus (a city, a reset area) moves the camera; taps and drags never do (like the web).
  const { lat: focusLat, lng: focusLng, radiusKm: focusRadius, seq } = focus;
  useEffect(() => {
    if (state !== 'ready' || seq === 0) {
      return;
    }
    webRef.current?.injectJavaScript(
      focusScript({ lat: focusLat, lng: focusLng, radiusKm: focusRadius })
    );
  }, [state, focusLat, focusLng, focusRadius, seq]);

  const onMessage = (event: WebViewMessageEvent) => {
    const message = parsePageMessage(event.nativeEvent.data);
    if (!message) {
      return;
    }
    switch (message.type) {
      case 'ready':
        setState('ready');
        break;
      case 'error':
        console.warn(`[TradingAreaMap] the Leaflet map failed to load (${message.reason}).`);
        setState('error');
        break;
      case 'pick':
        if (!live.current.disabled) {
          live.current.onPick({ lat: message.lat, lng: message.lng });
        }
        break;
      case 'viewport':
        live.current.onViewportChange({ lat: message.lat, lng: message.lng });
        break;
    }
  };

  return (
    <TradingAreaMapFrame
      state={state}
      onRetry={() => {
        setState('loading');
        setAttempt((current) => current + 1);
      }}
    >
      {/* The wrapper carries the test id: a stable tap target for the Maestro flows. */}
      <View style={StyleSheet.absoluteFill} testID={testID} collapsable={false}>
        <WebView<object>
          key={page.attempt}
          ref={webRef}
          testID={`${testID}-webview`}
          style={styles.web}
          source={{ html: page.html, baseUrl: PAGE_BASE_URL }}
          originWhitelist={['https://*', 'about:blank', 'data:*']}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={shouldStartLoad}
          onError={() => setState('error')}
          javaScriptEnabled
          domStorageEnabled={false}
          geolocationEnabled={false}
          allowFileAccess={false}
          setSupportMultipleWindows={false}
          nestedScrollEnabled
          overScrollMode="never"
          scrollEnabled={false}
          applicationNameForUserAgent="OrenjiTrade"
          accessibilityLabel={TRADING_AREA_MAP_LABEL}
        />
      </View>
    </TradingAreaMapFrame>
  );
}

function buildHtml(
  focus: TradingAreaMapProps['focus'],
  palette: { primary: string; surfaceVariant: string }
): string {
  return tradingAreaPageHtml({
    focus: { lat: focus.lat, lng: focus.lng, radiusKm: focus.radiusKm },
    color: palette.primary,
    background: palette.surfaceVariant,
    label: TRADING_AREA_MAP_LABEL,
    pinTitle: PIN_TITLE,
  });
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: 'transparent' },
});
