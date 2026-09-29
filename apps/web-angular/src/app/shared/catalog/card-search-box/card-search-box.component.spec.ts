import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import { CardSuggestion } from '@orenji/api-client';
import { provideApiClient } from '../../../core/api/provide-api-client';
import { AppConfigService } from '../../../core/config/app-config.service';
import { apiBaseUrlInterceptor } from '../../../core/http/api-base-url.interceptor';
import { errorInterceptor } from '../../../core/http/error.interceptor';
import { SUGGEST_DEBOUNCE_MS } from '../catalog-constants';
import { CardSearchBoxComponent, uniqueSuggestions } from './card-search-box.component';

const API = 'http://api.test';

const SUGGESTIONS: CardSuggestion[] = [
  {
    kind: 'CARD' as never,
    id: 'card-1',
    name: 'Azure-Eyes Sky Dragon',
    game: 'yugioh',
    setCode: 'AZR',
    printingCode: 'AZR-EN001',
    imageUrl: `${API}/img/azure.svg`,
  },
  {
    kind: 'PRINTING' as never,
    id: 'card-2',
    printingId: 'printing-9',
    name: 'Lantern Fox Spirit',
    game: 'yugioh',
    setCode: 'AZR',
    printingCode: 'AZR-EN011',
    imageUrl: `${API}/img/fox.svg`,
  },
];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('CardSearchBoxComponent', () => {
  let fixture: ComponentFixture<CardSearchBoxComponent>;
  let backend: HttpTestingController;
  let router: Router;
  let input: HTMLInputElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CardSearchBoxComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiBaseUrlInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        provideApiClient(),
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    TestBed.inject(AppConfigService).set({ apiBaseUrl: API });
    backend = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(CardSearchBoxComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
  });

  afterEach(() => backend.verify());

  async function type(value: string): Promise<void> {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await wait(SUGGEST_DEBOUNCE_MS + 30);
  }

  function options(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('mat-option'));
  }

  it('is a labelled combobox', () => {
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-label')).toBe('Search cards');
  });

  it('asks for suggestions after the debounce and lists them with set and printing code', async () => {
    await type('az');
    const req = backend.expectOne((r) => r.url === `${API}/api/v1/cards/suggest`);
    expect(req.request.params.get('q')).toBe('az');
    expect(req.request.params.get('limit')).toBe('8');
    req.flush(SUGGESTIONS);
    fixture.detectChanges();
    await fixture.whenStable();

    const texts = options().map((option) => option.textContent?.replace(/\s+/g, ' ').trim());
    expect(texts[0]).toContain('Azure-Eyes Sky Dragon');
    expect(texts[0]).toContain('AZR-EN001');
    expect(texts[1]).toContain('Printing');
    expect(texts.at(-1)).toContain('See all results for “az”');
  });

  it('drops printings that repeat the same card and printing code', () => {
    const twin = { ...SUGGESTIONS[1], printingId: 'printing-10' };
    expect(uniqueSuggestions([...SUGGESTIONS, twin])).toEqual(SUGGESTIONS);
  });

  it('does not ask for a single character', async () => {
    await type('a');
    backend.expectNone(`${API}/api/v1/cards/suggest`);
  });

  it('opens the card (with the printing) when a suggestion is chosen', async () => {
    await type('fox');
    backend.expectOne((r) => r.url === `${API}/api/v1/cards/suggest`).flush(SUGGESTIONS);
    fixture.detectChanges();
    await fixture.whenStable();
    options()[1].click();
    fixture.detectChanges();
    expect(router.navigate).toHaveBeenCalledWith(['/cards', 'card-2'], {
      queryParams: { printing: 'printing-9' },
    });
    await wait(5);
    expect(input.value).toBe('');
  });

  it('searches the catalog on Enter without a highlighted suggestion', async () => {
    await type('zz');
    backend.expectOne((r) => r.url === `${API}/api/v1/cards/suggest`).flush([]);
    fixture.detectChanges();
    expect(options()[0].textContent).toContain('No cards match');
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));
    expect(router.navigate).toHaveBeenCalledWith(['/cards'], { queryParams: { q: 'zz' } });
  });

  it('explains when suggestions are unavailable', async () => {
    await type('dragon');
    backend
      .expectOne((r) => r.url === `${API}/api/v1/cards/suggest`)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(options()[0].textContent).toContain('Suggestions are unavailable');
  });
});
