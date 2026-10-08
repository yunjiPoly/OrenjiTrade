import { useLegalLanguageStore } from '@/src/features/legal/legalLanguage';

/**
 * Sets the device's primary language for a test (`expo-localization` is mocked in
 * jest.setup.ts) and forgets any explicit EN/FR choice a previous test stored.
 */
export function mockLocales(languageTag: string): void {
  const localization = require('expo-localization') as {
    mockLocales: { languageCode: string | null; languageTag: string }[];
  };
  localization.mockLocales.splice(0, localization.mockLocales.length, {
    languageCode: languageTag.split('-')[0] ?? null,
    languageTag,
  });
  useLegalLanguageStore.getState().clear();
}
