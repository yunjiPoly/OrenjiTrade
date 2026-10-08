import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { appConfig } from '@/src/config/env';

/**
 * Which map library draws a map on this device (CLAUDE.md: "UI map code sits behind a
 * `MapAdapter` (Leaflet fallback when no key)"):
 * - `native`: react-native-maps, i.e. Apple Maps on iOS (no key needed) and Google Maps on Android
 *   in a build that carries the project's own key (`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`);
 * - `leaflet`: Leaflet + OpenStreetMap in a WebView, the web app's fallback adapter, on Android
 *   without that key, and always in Expo Go: the Google Maps SDK refuses the key bundled with
 *   Expo Go ("Authorization failure"), which leaves an empty grey map without tiles, pins or
 *   circles.
 * The web build uses Leaflet directly (`*.web.tsx`), never this choice.
 */
export type MapEngine = 'native' | 'leaflet';

export interface MapEngineInput {
  platform: string;
  /** The build carries the project's own Google Maps Android key. */
  googleMapsKeyConfigured: boolean;
  /** Running inside the Expo Go app (its own Google key, refused by the Maps SDK). */
  inExpoGo: boolean;
}

export function chooseMapEngine({
  platform,
  googleMapsKeyConfigured,
  inExpoGo,
}: MapEngineInput): MapEngine {
  if (platform === 'ios') {
    return 'native';
  }
  if (platform === 'android' && googleMapsKeyConfigured && !inExpoGo) {
    return 'native';
  }
  return 'leaflet';
}

/** The engine of this build and runtime. */
export function currentMapEngine(): MapEngine {
  return chooseMapEngine({
    platform: Platform.OS,
    googleMapsKeyConfigured: appConfig.googleMapsKeyConfigured,
    inExpoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
  });
}
