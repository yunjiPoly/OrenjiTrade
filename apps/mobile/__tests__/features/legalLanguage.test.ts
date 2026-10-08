import AsyncStorage from '@react-native-async-storage/async-storage';

import { describeConsent } from '@/src/features/legal/legalDocs';
import {
  LEGAL_LANGUAGE_STORAGE_KEY,
  currentLegalLanguage,
  deviceLanguageCode,
  isLegalLanguage,
  prefersFrench,
  resolveLegalLanguage,
  useLegalLanguageStore,
} from '@/src/features/legal/legalLanguage';
import { legalTextsFor, legalTitleOf } from '@/src/features/legal/legalTexts';
import { LEGAL_DOCUMENTS } from '@/src/legal/legalContent';
import { LEGAL_DOCUMENTS_FR, LEGAL_TRANSLATION_NOTICE_FR } from '@/src/legal/legalContent.fr';

import { LEGAL_DOCUMENTS as PUBLISHED } from '../support/fixtures';
import { mockLocales } from '../support/locales';

beforeEach(() => {
  mockLocales('en-CA');
});

describe('legal language (the web rule)', () => {
  it('is French when the device primary language is French, English otherwise', () => {
    expect(prefersFrench('fr')).toBe(true);
    expect(prefersFrench('fr-CA')).toBe(true);
    expect(prefersFrench('FR-FR')).toBe(true);
    expect(prefersFrench('en-CA')).toBe(false);
    expect(prefersFrench('frr')).toBe(false);
    expect(prefersFrench(null)).toBe(false);
    expect(resolveLegalLanguage(null, 'fr-CA')).toBe('fr');
    expect(resolveLegalLanguage(null, 'en-US')).toBe('en');
    expect(resolveLegalLanguage(null, null)).toBe('en');
    // An explicit choice wins over the device language.
    expect(resolveLegalLanguage('en', 'fr-CA')).toBe('en');
    expect(resolveLegalLanguage('fr', 'en-CA')).toBe('fr');
    expect(isLegalLanguage('fr')).toBe(true);
    expect(isLegalLanguage('de')).toBe(false);
  });

  it('reads the device language from expo-localization', () => {
    expect(deviceLanguageCode()).toBe('en-CA');
    mockLocales('fr-CA');
    expect(deviceLanguageCode()).toBe('fr-CA');
    expect(currentLegalLanguage()).toBe('fr');
  });

  it('remembers an explicit EN/FR choice on the device (AsyncStorage)', async () => {
    mockLocales('fr-CA');
    expect(currentLegalLanguage()).toBe('fr');
    useLegalLanguageStore.getState().set('en');
    expect(currentLegalLanguage()).toBe('en');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stored = JSON.parse((await AsyncStorage.getItem(LEGAL_LANGUAGE_STORAGE_KEY)) ?? '{}') as {
      state?: { choice?: string };
    };
    expect(stored.state?.choice).toBe('en');
    useLegalLanguageStore.getState().clear();
    expect(currentLegalLanguage()).toBe('fr');
  });

  it('serves the texts, banner and labels of each language', () => {
    const en = legalTextsFor('en');
    expect(en.documents).toBe(LEGAL_DOCUMENTS);
    expect(en.translationNotice).toBeNull();
    expect(en.labels.indexTitle).toBe('Legal');
    const fr = legalTextsFor('fr');
    expect(fr.documents).toBe(LEGAL_DOCUMENTS_FR);
    expect(fr.translationNotice).toBe(LEGAL_TRANSLATION_NOTICE_FR);
    expect(fr.draftBanner).toMatch(/^Ébauche/);
    expect(fr.labels.indexTitle).toBe('Mentions légales');
    expect(fr.labels.currentVersion('2026-09-01')).toBe('Version en vigueur : 2026-09-01.');
    // Every document exists in both languages with the same key, version and clause counts.
    for (const document of en.documentList) {
      const translated = fr.documents[document.key];
      expect(translated.key).toBe(document.key);
      expect(translated.version).toBe(document.version);
      expect(translated.sections.map((section) => section.clauses.length)).toEqual(
        document.sections.map((section) => section.clauses.length)
      );
    }
    expect(fr.documents['trading-safely'].title).toBe('Échanger en toute sécurité');
  });

  it('names a consent in the active language, falling back to the API title', () => {
    expect(legalTitleOf('terms', 'fr', 'Terms of Service')).toBe('Conditions d’utilisation');
    expect(legalTitleOf('terms', 'en', 'Terms of Service')).toBe('Terms of Service');
    expect(legalTitleOf('nope', 'fr', 'Fallback')).toBe('Fallback');
    const consent = { documentType: 'PRIVACY' as const, version: '2026-09-01' };
    expect(describeConsent(consent, PUBLISHED, 'fr')).toEqual({
      documentType: 'PRIVACY',
      version: '2026-09-01',
      title: 'Politique de confidentialité',
      key: 'privacy',
    });
    expect(describeConsent(consent, PUBLISHED).title).toBe('Privacy Policy');
    // The attestation has no in-app text: the API title stays.
    expect(
      describeConsent({ documentType: 'AGE_CONFIRMATION', version: '2026-10-05' }, PUBLISHED, 'fr')
    ).toEqual({
      documentType: 'AGE_CONFIRMATION',
      version: '2026-10-05',
      title: 'Age confirmation (18 years or older)',
      key: null,
    });
  });
});
