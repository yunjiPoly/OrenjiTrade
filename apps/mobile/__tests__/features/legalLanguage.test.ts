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
import { withPhoneAdditions } from '@/src/features/legal/phoneLegalAdditions';
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
    // The web's English drafts, with the phone's own additions (stage R15's Privacy Policy lines).
    expect(en.documents.terms).toBe(LEGAL_DOCUMENTS.terms);
    expect(en.documents.privacy).toEqual(withPhoneAdditions(LEGAL_DOCUMENTS.privacy));
    expect(en.translationNotice).toBeNull();
    expect(en.labels.indexTitle).toBe('Legal');
    const fr = legalTextsFor('fr');
    expect(fr.documents).toBe(LEGAL_DOCUMENTS_FR);
    expect(fr.translationNotice).toBe(LEGAL_TRANSLATION_NOTICE_FR);
    expect(fr.draftBanner).toMatch(/^Ébauche/);
    expect(fr.labels.indexTitle).toBe('Mentions légales');
    expect(fr.labels.currentVersion('2026-09-01')).toBe('Version en vigueur : 2026-09-01.');
    // Every document of the web's drafts exists in both languages with the same key, version and
    // clause counts (the phone's English additions of stage R15 are English only: no French work
    // since the owner's order of 2026-10-20).
    for (const document of Object.values(LEGAL_DOCUMENTS)) {
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

describe('the in-app legal drafts follow the region model (ADR 0017)', () => {
  /** Every string of one document: title, summary, definitions, headings and clauses. */
  const texts = (doc: (typeof LEGAL_DOCUMENTS)[keyof typeof LEGAL_DOCUMENTS]): string[] => [
    doc.title,
    doc.summary,
    ...doc.definitions.flatMap((item) => [item.term, item.definition]),
    ...doc.sections.flatMap((section) => [section.heading, ...section.clauses]),
  ];

  it('never promise proximity, distances or people on the map, in English or French', () => {
    const english =
      /\bnear (me|you|them|us|their|your)\b|\bnearby\b|\d\s?km\b|approximate (area|zone|position)|trading area|\byou appear(ing)? on the map\b|stops you appearing on the map/i;
    const french =
      /près d’(eux|elles)|près de (vous|chez)|à proximité|\d\s?km\b|zone approximative|vous apparaissez sur la carte|vous retire de la carte/i;
    for (const doc of Object.values(LEGAL_DOCUMENTS)) {
      for (const text of texts(doc)) expect(text).not.toMatch(english);
    }
    for (const doc of Object.values(LEGAL_DOCUMENTS_FR)) {
      for (const text of texts(doc)) expect(text).not.toMatch(french);
    }
    const nature = (docs: typeof LEGAL_DOCUMENTS) =>
      docs.terms.sections.find((section) => section.id === 'nature-of-service')?.clauses[0];
    expect(nature(LEGAL_DOCUMENTS)).toContain('find who in their region owns');
    expect(nature(LEGAL_DOCUMENTS_FR)).toContain('trouver qui, dans leur région, possède');
  });
});

describe("the phone's Privacy Policy for visitors without an account (stage R15)", () => {
  const privacy = legalTextsFor('en').documents.privacy;
  const text = privacy.sections.flatMap((section) => section.clauses).join('\n');

  it('says a visitor without an account never sees who a collector is', () => {
    expect(text).toContain(
      'Visitors without an account can browse public cards, wishes, Binders and deck cores'
    );
    expect(text).toContain(
      'never see who a Collector is: no name, handle, picture, rating or activity'
    );
    expect(text).toContain('Searching for a Collector by name finds nobody for them.');
  });

  it('says what is kept of a visitor: the region and the game on their device, an expiring counter', () => {
    expect(text).toContain('the region and the game they browse, on their own device');
    expect(text).toContain('the address is never stored, never logged with a place');
    expect(text).toContain('carry no account or device identifier');
  });

  it('stays a draft, with its banner, and leaves the other documents and French as they are', () => {
    expect(privacy.version).toBe(LEGAL_DOCUMENTS.privacy.version);
    expect(privacy.effectiveDate).toBeNull();
    expect(privacy.lastUpdated).toBe('2026-10-25');
    expect(legalTextsFor('en').draftBanner).toBe(legalTextsFor('en').draftBanner);
    expect(legalTextsFor('fr').documents.privacy).toBe(LEGAL_DOCUMENTS_FR.privacy);
    expect(legalTextsFor('en').documents.cookies).toBe(LEGAL_DOCUMENTS.cookies);
  });
});
