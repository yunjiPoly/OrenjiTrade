import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { LEGAL_DOCUMENTS } from './legal-content';
import { LEGAL_DOCUMENTS_FR } from './legal-content.fr';
import {
  LEGAL_LANGUAGE_STORAGE_KEY,
  LegalLanguageService,
  browserPrefersFrench,
} from './legal-language.service';
import { LegalTextsService, legalKeyOfUrl } from './legal-texts.service';

/** A document whose window exposes the given browser languages and (optionally) storage. */
function fakeDocument(languages: string[], storage: Storage | null = localStorage): Document {
  return {
    defaultView: {
      navigator: { language: languages[0] ?? '', languages },
      localStorage: storage,
    },
  } as unknown as Document;
}

function configure(languages: string[], storage: Storage | null = localStorage) {
  TestBed.configureTestingModule({
    providers: [{ provide: DOCUMENT, useValue: fakeDocument(languages, storage) }],
  });
  return {
    language: TestBed.inject(LegalLanguageService),
    texts: TestBed.inject(LegalTextsService),
  };
}

describe('LegalLanguageService and LegalTextsService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('defaults to French for a French browser and to English otherwise', () => {
    expect(browserPrefersFrench({ language: 'fr-CA', languages: ['fr-CA', 'en-CA'] })).toBe(true);
    expect(browserPrefersFrench({ language: 'fr', languages: [] })).toBe(true);
    expect(browserPrefersFrench({ language: 'en-CA', languages: ['en-CA', 'fr-CA'] })).toBe(false);
    expect(browserPrefersFrench({ language: 'frp', languages: ['frp'] })).toBe(false);
    expect(browserPrefersFrench(null)).toBe(false);

    const { language, texts } = configure(['fr-CA', 'en-CA']);
    expect(language.language()).toBe('fr');
    expect(language.isFrench()).toBe(true);
    expect(language.labels().contact).toBe('Nous joindre');
    expect(texts.documents()).toBe(LEGAL_DOCUMENTS_FR);
    expect(texts.documentFor('terms')?.title).toBe('Conditions d’utilisation');
    expect(texts.translationNotice()).toContain('Traduction');
    expect(texts.draftBanner()).toContain('Ébauche');
  });

  it('serves the English texts for an English browser, without a translation notice', () => {
    const { language, texts } = configure(['en-CA', 'fr-CA']);
    expect(language.language()).toBe('en');
    expect(texts.documents()).toBe(LEGAL_DOCUMENTS);
    expect(texts.documentFor('terms')?.title).toBe('Terms of Service');
    expect(texts.translationNotice()).toBeNull();
    expect(texts.documentFor('nope')).toBeNull();
  });

  it('remembers an explicit choice in local storage and prefers it over the browser language', () => {
    const { language } = configure(['en-CA']);
    language.set('fr');
    expect(language.language()).toBe('fr');
    expect(localStorage.getItem(LEGAL_LANGUAGE_STORAGE_KEY)).toBe('fr');

    TestBed.resetTestingModule();
    expect(configure(['en-CA']).language.language()).toBe('fr');
  });

  it('works without storage (private mode) and ignores garbage in it', () => {
    localStorage.setItem(LEGAL_LANGUAGE_STORAGE_KEY, 'klingon');
    expect(configure(['fr']).language.language()).toBe('fr');
    TestBed.resetTestingModule();
    const { language } = configure(['fr-FR'], null);
    expect(language.language()).toBe('fr');
    expect(() => language.set('en')).not.toThrow();
    expect(language.language()).toBe('en');
  });

  it('maps legal page urls to keys and titles in the active language', () => {
    const { language, texts } = configure(['fr-CA']);
    expect(legalKeyOfUrl('/legal/terms')).toBe('terms');
    expect(legalKeyOfUrl('/legal/privacy?lang=fr#x')).toBe('privacy');
    expect(legalKeyOfUrl('/legal#age-confirmation')).toBeNull();
    expect(legalKeyOfUrl('/legal/nope')).toBeNull();
    expect(legalKeyOfUrl(null)).toBeNull();
    expect(texts.titleOf('/legal/privacy', 'Privacy Policy')).toBe('Politique de confidentialité');
    expect(texts.titleOf('/legal#age-confirmation', 'Age confirmation')).toBe('Age confirmation');
    language.set('en');
    expect(texts.titleOf('/legal/privacy', 'x')).toBe('Privacy Policy');
  });
});
