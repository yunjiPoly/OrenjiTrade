import Constants from 'expo-constants';

/** The app's own version (`version` of app.config.ts), or null where the build does not say it. */
export function appVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}
