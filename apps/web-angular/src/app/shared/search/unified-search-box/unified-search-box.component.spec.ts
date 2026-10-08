import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SearchSuggestion } from '@orenji/api-client';
import { provideApiClient } from '../../../core/api/provide-api-client';
import { AppConfigService } from '../../../core/config/app-config.service';
import { apiBaseUrlInterceptor } from '../../../core/http/api-base-url.interceptor';
import { errorInterceptor } from '../../../core/http/error.interceptor';
import { SUGGEST_DEBOUNCE_MS } from '../../catalog/catalog-constants';
import { UnifiedSearchBoxComponent } from './unified-search-box.component';

const API = 'http://api.test';

const SUGGESTIONS: SearchSuggestion[] = [
  {
    type: 'COLLECTOR' as never,
    id: 'u1',
    label: 'Maïka Tremblay',
    sublabel: '@maika · Quebec, Canada',
    slug: 'maika',
  },
  {
    type: 'CARD' as never,
    id: 'c1',
    label: 'Lantern Fox Spirit',
    sublabel: 'AZR-EN011 · AZR',
    imageUrl: `${API}/img/fox.svg`,
    game: 'yugioh',
  },
  { type: 'TAG' as never, id: 't1', label: 'Local meetups', slug: 'local-meetups' },
];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('UnifiedSearchBoxComponent', () => {
  let fixture: ComponentFixture<UnifiedSearchBoxComponent>;
  let backend: HttpTestingController;
  let input: HTMLInputElement;
  let picked: SearchSuggestion[];
  let submitted: string[];

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [UnifiedSearchBoxComponent],
      providers: [
        provideHttpClient(withInterceptors([apiBaseUrlInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        provideApiClient(),
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    TestBed.inject(AppConfigService).set({ apiBaseUrl: API });
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(UnifiedSearchBoxComponent);
    fixture.componentRef.setInput('label', 'Search the map');
    picked = [];
    submitted = [];
    fixture.componentInstance.picked.subscribe((value) => picked.push(value));
    fixture.componentInstance.submitted.subscribe((value) => submitted.push(value));
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
    expect(input.getAttribute('aria-label')).toBe('Search the map');
  });

  it('asks /search/suggest in the given platform region, never with coordinates', async () => {
    fixture.componentRef.setInput('region', 'europe');
    await type('lan');
    const req = backend.expectOne((r) => r.url === `${API}/api/v1/search/suggest`);
    expect(req.request.params.get('q')).toBe('lan');
    expect(req.request.params.get('region')).toBe('europe');
    expect(req.request.params.has('lat')).toBe(false);
    expect(req.request.params.has('lng')).toBe(false);
    req.flush(SUGGESTIONS);
    fixture.detectChanges();
    await fixture.whenStable();

    const groups = Array.from(document.querySelectorAll('mat-optgroup')).map((group) =>
      group.querySelector('.mat-mdc-optgroup-label')?.textContent?.trim(),
    );
    expect(groups).toEqual(['Cards', 'Collectors', 'Tags']);
    const texts = options().map((option) => option.textContent?.replace(/\s+/g, ' ').trim());
    expect(texts[0]).toContain('Lantern Fox Spirit');
    expect(texts[0]).toContain('Card');
    expect(texts[1]).toContain('@maika');
  });

  it('uses the browsed region when none is given', async () => {
    await type('lan');
    const req = backend.expectOne((r) => r.url === `${API}/api/v1/search/suggest`);
    expect(req.request.params.get('region')).toBe('americas-north');
    req.flush([]);
    fixture.detectChanges();
    expect(options()[0].textContent).toContain('Nothing matches');
  });

  it('emits the chosen entry and clears the field', async () => {
    await type('fox');
    backend.expectOne((r) => r.url === `${API}/api/v1/search/suggest`).flush(SUGGESTIONS);
    fixture.detectChanges();
    await fixture.whenStable();
    options()[0].click();
    fixture.detectChanges();
    expect(picked.map((entry) => entry.id)).toEqual(['c1']);
    await wait(5);
    expect(input.value).toBe('');
  });

  it('submits the text on Enter and explains unavailable suggestions', async () => {
    await type('dragon');
    backend
      .expectOne((r) => r.url === `${API}/api/v1/search/suggest`)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(options()[0].textContent).toContain('Suggestions are unavailable');
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));
    expect(submitted).toEqual(['dragon']);
  });
});
