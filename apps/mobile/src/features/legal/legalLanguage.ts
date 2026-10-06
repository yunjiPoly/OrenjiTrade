import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** The languages the legal texts are published in (the API's `ConsentRequest.language`). */
export type LegalLanguage = 'en' | 'fr';

export const LEGAL_LANGUAGES: readonly LegalLanguage[] = ['en', 'fr'];

export const LEGAL_LANGUAGE_STORAGE_KEY = 'orenjitrade.legal-language.v1';

export function isLegalLanguage(value: unknown): value is LegalLanguage {
  return value === 'en' || value === 'fr';
}

/** True when the device's primary language is French (`fr`, `fr-CA`, `fr-FR`...; web rule). */
export function prefersFrench(languageCode: string | null | undefined): boolean {
  return /^fr(-|$)/i.test(languageCode ?? '');
}

/** The device's primary language code (`expo-localization`), or null when unknown. */
export function deviceLanguageCode(): string | null {
  try {
    const locale = getLocales()[0];
    return locale?.languageTag || locale?.languageCode || null;
  } catch {
    return null;
  }
}

/** An explicit choice wins, then the device language (French → `fr`), else English. */
export function resolveLegalLanguage(
  choice: LegalLanguage | null,
  deviceLanguage: string | null = deviceLanguageCode()
): LegalLanguage {
  if (choice) {
    return choice;
  }
  return prefersFrench(deviceLanguage) ? 'fr' : 'en';
}

interface LegalLanguageState {
  /** The language the collector chose with the EN/FR switch; null until they do. */
  choice: LegalLanguage | null;
  set: (language: LegalLanguage) => void;
  clear: () => void;
}

/**
 * The language the legal texts are shown in (mirror of the web's `LegalLanguageService`): an
 * explicit choice made with the EN/FR switch, remembered on this device (AsyncStorage, not per
 * account: the choice is made before signing in too), otherwise French when the device's
 * primary language is French (Bill 96), English otherwise. Consents record this language next to
 * the document version (`POST /me/consents`), so the API knows which translation was read.
 */
export const useLegalLanguageStore = create<LegalLanguageState>()(
  persist(
    (set) => ({
      choice: null,
      set: (choice) => set({ choice }),
      clear: () => set({ choice: null }),
    }),
    {
      name: LEGAL_LANGUAGE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ choice: state.choice }),
    }
  )
);

/** The active legal language outside React (the consents the account provider records). */
export function currentLegalLanguage(): LegalLanguage {
  return resolveLegalLanguage(useLegalLanguageStore.getState().choice);
}

export interface LegalLanguageHandle {
  language: LegalLanguage;
  isFrench: boolean;
  /** Switches the language and remembers the choice on this device. */
  set: (language: LegalLanguage) => void;
}

export function useLegalLanguage(): LegalLanguageHandle {
  const choice = useLegalLanguageStore((state) => state.choice);
  const set = useLegalLanguageStore((state) => state.set);
  const language = resolveLegalLanguage(choice);
  return { language, isFrench: language === 'fr', set };
}
