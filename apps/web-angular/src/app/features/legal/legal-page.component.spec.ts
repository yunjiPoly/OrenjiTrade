import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LEGAL_DOCUMENTS, LEGAL_DRAFT_BANNER, LEGAL_KEYS } from './legal-content';
import { LegalPageComponent } from './legal-page.component';

describe('LegalPageComponent', () => {
  let fixture: ComponentFixture<LegalPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LegalPageComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(LegalPageComponent);
  });

  const render = async (key: string): Promise<HTMLElement> => {
    fixture.componentRef.setInput('key', key);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('exposes all eight legal route keys', () => {
    expect(LEGAL_KEYS).toEqual([
      'terms',
      'privacy',
      'community-guidelines',
      'marketplace-policy',
      'payment-protection',
      'refund-dispute',
      'cookies',
      'acceptable-use',
    ]);
  });

  for (const key of LEGAL_KEYS) {
    it(`renders the draft banner, title and numbered clauses for "${key}"`, async () => {
      const element = await render(key);
      const doc = LEGAL_DOCUMENTS[key];

      const banner = element.querySelector('[role="status"]');
      expect(banner?.textContent).toContain(LEGAL_DRAFT_BANNER);
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

  it('renders an error state for an unknown key', async () => {
    const element = await render('does-not-exist');
    expect(element.querySelector('[role="status"]')).toBeNull();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Unknown legal document',
    );
  });
});
