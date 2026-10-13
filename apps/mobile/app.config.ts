import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * OrenjiTrade Expo configuration.
 *
 * Only public values belong here. `EXPO_PUBLIC_*` variables are inlined into the JS bundle by
 * Expo, so they must never contain secrets (see root CLAUDE.md, "Never put secrets in frontend
 * bundles"). The app reads no device location and draws no map provider (ADR 0017): no Google
 * Maps key, no location permission. `react-native-maps` stays installed (its plugin runs without
 * a key, so no Maps API key meta-data is written) for a future native boundary map.
 */

const WEB_HOSTS = ['www.orenjitrade.com', 'orenjitrade.com'] as const;
const DEEP_LINK_PATH_PREFIXES = ['/collectors/', '/cards/', '/binders/'] as const;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'OrenjiTrade',
  slug: 'orenjitrade',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'orenjitrade',
  userInterfaceStyle: 'automatic',
  runtimeVersion: { policy: 'appVersion' },
  ios: {
    bundleIdentifier: 'com.orenjitrade.app',
    supportsTablet: true,
    associatedDomains: WEB_HOSTS.map((host) => `applinks:${host}`),
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
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
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-image',
    // Google sign-in on a device: the system browser session of expo-auth-session.
    'expo-web-browser',
    // Only configures the optional "share into the app" extension, which stays disabled.
    'expo-sharing',
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
        photosPermission:
          'OrenjiTrade needs access to your photos to add card pictures to a binder.',
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
    // No key: the plugin removes the Maps API key meta-data entry (ADR 0017).
    'react-native-maps',
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
