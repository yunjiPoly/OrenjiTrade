import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { LEGAL_DOCUMENTS } from './legal-content';
import { LEGAL_DOCUMENTS_FR } from './legal-content.fr';
import {
  LEGAL_LANGUAGE_STORAGE_KEY,
  LegalLanguageService,
  browserPrefersFrench,
  legalKeyOfUrl,
} from './legal-language.service';

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
  return TestBed.inject(LegalLanguageService);
}

describe('LegalLanguageService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('defaults to French for a French browser and to English otherwise', () => {
    expect(browserPrefersFrench({ language: 'fr-CA', languages: ['fr-CA', 'en-CA'] })).toBe(true);
    expect(browserPrefersFrench({ language: 'fr', languages: [] })).toBe(true);
    expect(browserPrefersFrench({ language: 'en-CA', languages: ['en-CA', 'fr-CA'] })).toBe(false);
    expect(browserPrefersFrench({ language: 'frp', languages: ['frp'] })).toBe(false);
    expect(browserPrefersFrench(null)).toBe(false);

    const french = configure(['fr-CA', 'en-CA']);
    expect(french.language()).toBe('fr');
    expect(french.isFrench()).toBe(true);
    expect(french.documents()).toBe(LEGAL_DOCUMENTS_FR);
    expect(french.documentFor('terms')?.title).toBe('Conditions d’utilisation');
    expect(french.translationNotice()).toContain('Traduction');
    expect(french.labels().contact).toBe('Nous joindre');
  });

  it('serves the English texts for an English browser, without a translation notice', () => {
    const english = configure(['en-CA', 'fr-CA']);
    expect(english.language()).toBe('en');
    expect(english.documents()).toBe(LEGAL_DOCUMENTS);
    expect(english.documentFor('terms')?.title).toBe('Terms of Service');
    expect(english.translationNotice()).toBeNull();
    expect(english.documentFor('nope')).toBeNull();
  });

  it('remembers an explicit choice in local storage and prefers it over the browser language', () => {
    const service = configure(['en-CA']);
    service.set('fr');
    expect(service.language()).toBe('fr');
    expect(localStorage.getItem(LEGAL_LANGUAGE_STORAGE_KEY)).toBe('fr');

    TestBed.resetTestingModule();
    const again = configure(['en-CA']);
    expect(again.language()).toBe('fr');
  });

  it('works without storage (private mode) and ignores garbage in it', () => {
    localStorage.setItem(LEGAL_LANGUAGE_STORAGE_KEY, 'klingon');
    expect(configure(['fr']).language()).toBe('fr');
    TestBed.resetTestingModule();
    const noStorage = configure(['fr-FR'], null);
    expect(noStorage.language()).toBe('fr');
    expect(() => noStorage.set('en')).not.toThrow();
    expect(noStorage.language()).toBe('en');
  });

  it('maps legal page urls to keys and titles in the active language', () => {
    const service = configure(['fr-CA']);
    expect(legalKeyOfUrl('/legal/terms')).toBe('terms');
    expect(legalKeyOfUrl('/legal/privacy?lang=fr#x')).toBe('privacy');
    expect(legalKeyOfUrl('/legal#age-confirmation')).toBeNull();
    expect(legalKeyOfUrl('/legal/nope')).toBeNull();
    expect(legalKeyOfUrl(null)).toBeNull();
    expect(service.titleOf('/legal/privacy', 'Privacy Policy')).toBe(
      'Politique de confidentialité',
    );
    expect(service.titleOf('/legal#age-confirmation', 'Age confirmation')).toBe('Age confirmation');
    service.set('en');
    expect(service.titleOf('/legal/privacy', 'x')).toBe('Privacy Policy');
  });
});
