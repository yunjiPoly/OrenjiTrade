import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LEGAL_DOCUMENTS, LEGAL_DRAFT_BANNER, LEGAL_KEYS } from './legal-content';
import {
  LEGAL_DOCUMENTS_FR,
  LEGAL_DRAFT_BANNER_FR,
  LEGAL_TRANSLATION_NOTICE_FR,
} from './legal-content.fr';
import { LEGAL_LANGUAGE_STORAGE_KEY, LegalLanguageService } from './legal-language.service';
import { LegalPageComponent } from './legal-page.component';

describe('LegalPageComponent', () => {
  let fixture: ComponentFixture<LegalPageComponent>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LegalPageComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(LegalPageComponent);
  });

  afterEach(() => localStorage.clear());

  const render = async (key: string, lang?: string): Promise<HTMLElement> => {
    fixture.componentRef.setInput('key', key);
    if (lang !== undefined) {
      fixture.componentRef.setInput('lang', lang);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('exposes all nine legal route keys', () => {
    expect(LEGAL_KEYS).toEqual([
      'terms',
      'privacy',
      'community-guidelines',
      'marketplace-policy',
      'payment-protection',
      'refund-dispute',
      'cookies',
      'acceptable-use',
      'trading-safely',
    ]);
  });

  for (const key of LEGAL_KEYS) {
    it(`renders the draft banner, title and numbered clauses for "${key}"`, async () => {
      TestBed.inject(LegalLanguageService).set('en');
      const element = await render(key);
      const doc = LEGAL_DOCUMENTS[key];

      const banner = element.querySelector('[role="status"]');
      expect(banner?.textContent).toContain(LEGAL_DRAFT_BANNER);
      expect(element.querySelector('[data-testid="legal-translation-notice"]')).toBeNull();
      expect(element.querySelector('article')?.getAttribute('lang')).toBe('en');
      expect(element.querySelector('h1')?.textContent).toBe(doc.title);
      expect(element.textContent).toContain('Effective date:');
      expect(element.textContent).toContain('[Effective date to be set at launch]');

      const headings = Array.from(element.querySelectorAll('section h2'), (h) => h.textContent);
      expect(headings[0]).toBe('Definitions');
      expect(headings).toContain(`1. ${doc.sections[0]?.heading}`);
      expect(headings.at(-1)).toBe('Contact');

      const firstClauseNumber = element.querySelector('.legal__clause-number')?.textContent;
      expect(firstClauseNumber).toBe('1.1');
      expect(element.textContent).toContain(doc.contact);
    });
  }

  it('renders the French translation with both banner lines when French is active', async () => {
    TestBed.inject(LegalLanguageService).set('fr');
    const element = await render('privacy');
    const doc = LEGAL_DOCUMENTS_FR.privacy;

    expect(element.querySelector('article')?.getAttribute('lang')).toBe('fr');
    expect(element.querySelector('[role="status"]')?.textContent).toContain(LEGAL_DRAFT_BANNER_FR);
    expect(
      element.querySelector('[data-testid="legal-translation-notice"]')?.textContent,
    ).toContain(LEGAL_TRANSLATION_NOTICE_FR);
    expect(element.querySelector('h1')?.textContent).toBe(doc.title);
    expect(element.textContent).toContain('Date d’entrée en vigueur :');
    expect(element.textContent).toContain('[Date d’entrée en vigueur à fixer au lancement]');
    const headings = Array.from(element.querySelectorAll('section h2'), (h) => h.textContent);
    expect(headings[0]).toBe('Définitions');
    expect(headings).toContain('1. Responsable de la protection des renseignements personnels');
    expect(headings.at(-1)).toBe('Nous joindre');
    expect(element.textContent).toContain('Commission d’accès à l’information du Québec');
    // The "See also" links carry the French titles.
    expect(element.querySelector('.legal__related')?.textContent).toContain(
      'Conditions d’utilisation',
    );
  });

  it('switches language with the EN/FR toggle and remembers the choice', async () => {
    const language = TestBed.inject(LegalLanguageService);
    language.set('en');
    const element = await render('terms');
    const toggles = element.querySelectorAll<HTMLButtonElement>(
      '[data-testid="legal-language-switch"] button',
    );
    expect(toggles).toHaveLength(2);
    expect(toggles[0].getAttribute('aria-label')).toBe('English');
    expect(toggles[1].getAttribute('aria-label')).toBe('Français');

    toggles[1].click();
    await fixture.whenStable();
    expect(language.language()).toBe('fr');
    expect(element.querySelector('h1')?.textContent).toBe('Conditions d’utilisation');
    expect(localStorage.getItem(LEGAL_LANGUAGE_STORAGE_KEY)).toBe('fr');

    toggles[0].click();
    await fixture.whenStable();
    expect(element.querySelector('h1')?.textContent).toBe('Terms of Service');
    expect(localStorage.getItem(LEGAL_LANGUAGE_STORAGE_KEY)).toBe('en');
  });

  it('selects the language from the ?lang query parameter', async () => {
    const language = TestBed.inject(LegalLanguageService);
    language.set('en');
    const element = await render('trading-safely', 'fr');
    expect(language.language()).toBe('fr');
    expect(element.querySelector('h1')?.textContent).toBe('Échanger en toute sécurité');
    expect(element.textContent).toContain('zones d’échange sécuritaires');
  });

  it('renders an error state for an unknown key', async () => {
    TestBed.inject(LegalLanguageService).set('en');
    const element = await render('does-not-exist');
    expect(element.querySelector('[role="status"]')).toBeNull();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Unknown legal document',
    );
  });
});
