import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * OrenjiTrade Expo configuration.
 *
 * Only public values belong here. `EXPO_PUBLIC_*` variables are inlined into the JS bundle by
 * Expo, so they must never contain secrets (see root CLAUDE.md, "Never put secrets in frontend
 * bundles"). The Google Maps Android key is a browser/app-restricted public key; when it is not
 * set the Android map renders an empty canvas instead of crashing.
 */

const WEB_HOSTS = ['www.orenjitrade.com', 'orenjitrade.com'] as const;
const DEEP_LINK_PATH_PREFIXES = ['/collectors/', '/cards/', '/binders/'] as const;

const googleMapsAndroidApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || undefined;

const LOCATION_PURPOSE =
  'OrenjiTrade uses your approximate location only to suggest a trading area on the map. ' +
  'Your exact position is never shared with other collectors.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'OrenjiTrade',
  slug: 'orenjitrade',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'orenjitrade',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  runtimeVersion: { policy: 'appVersion' },
  ios: {
    bundleIdentifier: 'com.orenjitrade.app',
    supportsTablet: true,
    associatedDomains: WEB_HOSTS.map((host) => `applinks:${host}`),
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Ask iOS for reduced-accuracy location by default: the product only ever needs an
      // approximate trading area (ADR 0004).
      NSLocationDefaultAccuracyReduced: true,
    },
  },
  android: {
    package: 'com.orenjitrade.app',
    adaptiveIcon: {
      backgroundColor: '#FFFBF7',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: WEB_HOSTS.flatMap((host) =>
          DEEP_LINK_PATH_PREFIXES.map((pathPrefix) => ({ scheme: 'https', host, pathPrefix }))
        ),
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    ...(googleMapsAndroidApiKey
      ? { config: { googleMaps: { apiKey: googleMapsAndroidApiKey } } }
      : {}),
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#FFFBF7',
        dark: { backgroundColor: '#141210' },
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: LOCATION_PURPOSE,
        locationAlwaysAndWhenInUsePermission: LOCATION_PURPOSE,
        locationAlwaysPermission: LOCATION_PURPOSE,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'OrenjiTrade uses the camera to scan and photograph your cards.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'OrenjiTrade needs access to your photos to add card pictures to a binder.',
        cameraPermission: 'OrenjiTrade uses the camera to photograph your cards.',
        microphonePermission: false,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/images/android-icon-monochrome.png',
        color: '#F4761A',
        defaultChannel: 'default',
      },
    ],
    [
      'expo-secure-store',
      {
        configureAndroidBackup: true,
        faceIDPermission: 'OrenjiTrade can use Face ID to unlock your saved session.',
      },
    ],
    [
      'react-native-maps',
      {
        // Undefined => the plugin removes the meta-data entry; nothing crashes without a key.
        androidGoogleMapsApiKey: googleMapsAndroidApiKey,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      // Placeholder until the EAS project is created (`npx eas-cli init` overwrites this).
      projectId: process.env.EAS_PROJECT_ID ?? 'REPLACE_WITH_EAS_PROJECT_ID',
    },
  },
});
