import { useState } from 'react';

import { currentMapEngine } from '@/src/components/map/mapEngine';

import type { TradingAreaMapProps } from './TradingAreaMap.types';
import { TradingAreaMapLeaflet } from './TradingAreaMapLeaflet';
import { TradingAreaMapNative } from './TradingAreaMapNative';

/**
 * Trading-area map on iOS/Android, behind the app's map adapter choice (`mapEngine`): Apple Maps
 * on iOS and Google Maps on Android with the project's own key (react-native-maps), otherwise
 * Leaflet + OpenStreetMap in a WebView, the web app's fallback (Expo Go on Android). The web build
 * uses `TradingAreaMap.web.tsx`.
 */
export function TradingAreaMap(props: TradingAreaMapProps) {
  const [engine] = useState(currentMapEngine);
  return engine === 'native' ? (
    <TradingAreaMapNative {...props} />
  ) : (
    <TradingAreaMapLeaflet {...props} />
  );
}
