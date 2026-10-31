import { LiveAnnouncer } from '@angular/cdk/a11y';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CatalogService, SearchService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { SessionService, SessionStatus } from '../../auth/session.service';
import { RECENT_SEARCHES_STORAGE_KEY, RecentSearches } from '../../search/recent-searches.service';
import { ShellLayout } from '../shell-layout.service';
import { GlobalSearchComponent } from './global-search.component';
import { SEARCH_DEBOUNCE_MS } from './global-search.model';

const place = {
  regionCode: 'americas-north',
  countryCode: 'CA',
  countryName: 'Canada',
  subdivisionCode: 'CA-QC',
  subdivisionName: 'Quebec',
  label: 'Quebec, Canada',
};

describe('GlobalSearchComponent (spec 4.4, board W3)', () => {
  let fixture: ComponentFixture<GlobalSearchComponent>;
  let element: HTMLElement;
  const status = signal<SessionStatus>('ready');
  let suggestCards: ReturnType<typeof vi.fn>;
  let searchCollectors: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    status.set('ready');
    suggestCards = vi.fn(() =>
      of([
        {
          kind: 'CARD',
          id: 'c-1',
          name: 'Ash Blossom & Joyous Spring',
          game: 'yugioh',
          printingCount: 12,
        },
        {
          kind: 'PRINTING',
          id: 'c-1',
          printingId: 'p-1',
          name: 'Ash Blossom & Joyous Spring',
          printingCode: 'LAVD-EN008',
          game: 'yugioh',
        },
      ]),
    );
    searchCollectors = vi.fn(() =>
      of([{ id: 'u-1', handle: 'ash_trader', displayName: 'Ash Ketch', place }]),
    );
    await TestBed.configureTestingModule({
      imports: [GlobalSearchComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogService, useValue: { suggestCards, listGames: () => of([]) } },
        { provide: SearchService, useValue: { searchCollectorsByName: searchCollectors } },
        { provide: SessionService, useValue: { status, me: signal(null) } },
        { provide: AuthService, useValue: { user: signal({ uid: 'u-me' }) } },
      ],
    }).compileComponents();
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(GlobalSearchComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
  });

  const input = () => element.querySelector<HTMLInputElement>('#global-search-input')!;

  async function type(text: string): Promise<void> {
    input().focus();
    input().dispatchEvent(new FocusEvent('focus'));
    input().value = text;
    input().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 1);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function key(name: string, init: KeyboardEventInit = {}): void {
    input().dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...init }));
    fixture.detectChanges();
  }

  it('is an ARIA combobox naming the browsed game', () => {
    expect(input().getAttribute('role')).toBe('combobox');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().placeholder).toBe('Search Yu-Gi-Oh! cards or collectors');
    status.set('anonymous');
    fixture.detectChanges();
    expect(input().placeholder).toBe('Search Yu-Gi-Oh! cards');
  });

  it('lists the recent searches of this browser on focus, with Clear and remove buttons', async () => {
    TestBed.inject(RecentSearches).remember('Maxx "C"');
    TestBed.inject(RecentSearches).remember('LAVD-EN008');
    await type('');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    const rows = Array.from(element.querySelectorAll('.gs__recent-run'), (b) =>
      b.textContent?.trim(),
    );
    expect(rows).toEqual(['LAVD-EN008', 'Maxx "C"']);
    expect(element.textContent).toContain(
      'Only you see your searches. They’re kept in this browser.',
    );
    element
      .querySelector<HTMLButtonElement>('[aria-label="Remove LAVD-EN008 from recent searches"]')!
      .click();
    fixture.detectChanges();
    expect(TestBed.inject(RecentSearches).list()).toEqual(['Maxx "C"']);
    element.querySelector<HTMLButtonElement>('.gs__head .gs__text-action')!.click();
    fixture.detectChanges();
    expect(element.textContent).toContain('No recent searches.');
  });

  it('lists cards of the game and collectors of the region from two letters, no counts', async () => {
    await type('a');
    expect(suggestCards).not.toHaveBeenCalled();
    await type('ash');
    expect(suggestCards).toHaveBeenCalledWith(
      { q: 'ash', game: 'yugioh', limit: 12 },
      'body',
      false,
      expect.anything(),
    );
    expect(searchCollectors).toHaveBeenCalledWith(
      { q: 'ash', region: 'americas-north', limit: 3, game: 'yugioh' },
      'body',
      false,
      expect.anything(),
    );
    const options = Array.from(element.querySelectorAll<HTMLAnchorElement>('[role="option"]'));
    expect(options.map((o) => o.getAttribute('href'))).toEqual([
      '/cards/c-1',
      '/cards/c-1?printing=p-1',
      '/collectors/ash_trader',
      '/search?tab=binders&q=ash',
    ]);
    expect(options[1].querySelector('.gs__code')?.textContent).toContain('LAVD-EN008');
    expect(options[0].querySelector('.gs__hit')?.textContent).toBe('Ash');
    expect(options[2].textContent).toContain('Quebec');
    // Handle, then the display name with its match, then the province (board W3).
    expect(options[2].querySelector('.gs__handle')?.textContent).toBe('ash_trader');
    expect(options[2].querySelector('.gs__meta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Ash Ketch · Quebec',
    );
    expect(options[2].getAttribute('aria-label')).toBe('ash_trader, Ash Ketch, Quebec');
    expect(Array.from(options[2].querySelectorAll('.gs__hit'), (mark) => mark.textContent)).toEqual(
      ['ash', 'Ash'],
    );
    expect(options[3].textContent).toContain('Search binders and deck cores for ‘ash’');
    // No counts of any kind (spec 4.4): the API's printing count is never shown.
    expect(element.querySelector('#gs-listbox')?.textContent).not.toMatch(/\b12\b/);
  });

  it('never looks for collectors as a guest (R15)', async () => {
    status.set('anonymous');
    await type('ash');
    expect(searchCollectors).not.toHaveBeenCalled();
    expect(element.querySelector('[aria-label="Collectors"]')).toBeNull();
  });

  it('moves with the arrows, opens with Enter and remembers the text', async () => {
    await type('ash');
    key('ArrowDown');
    key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe('gs-opt-card-1');
    key('Enter');
    expect(navigate).toHaveBeenCalledWith(['/cards', 'c-1'], { queryParams: { printing: 'p-1' } });
    expect(TestBed.inject(RecentSearches).list()).toEqual(['ash']);
  });

  it('makes a typed printing code the active row: Enter opens that printing (spec 4.4)', async () => {
    await type('lavd en008');
    expect(input().getAttribute('aria-activedescendant')).toBe('gs-opt-card-1');
    key('Enter');
    expect(navigate).toHaveBeenCalledWith(['/cards', 'c-1'], { queryParams: { printing: 'p-1' } });
  });

  it('opens the list again with Ctrl/Cmd+K or ArrowDown after Esc, and Tab never closes it', async () => {
    await type('ash');
    key('Escape');
    expect(element.querySelector('#gs-panel')).toBeNull();
    key('k', { ctrlKey: true });
    expect(element.querySelector('#gs-panel')).not.toBeNull();
    key('Escape');
    key('ArrowDown');
    expect(element.querySelector('#gs-panel')).not.toBeNull();
    // Tab walks on (into the panel or to the bell); the list closes on focusout only.
    key('Tab');
    expect(element.querySelector('#gs-panel')).not.toBeNull();
  });

  it('moves through the recent searches with the arrows, and Esc goes back to the field', async () => {
    TestBed.inject(RecentSearches).remember('lantern');
    TestBed.inject(RecentSearches).remember('obsidian');
    await type('');
    key('ArrowDown');
    const rows = () => Array.from(element.querySelectorAll<HTMLButtonElement>('.gs__recent-run'));
    const press = (name: string) => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();
    };
    expect(document.activeElement).toBe(rows()[0]);
    press('ArrowDown');
    expect(document.activeElement).toBe(rows()[1]);
    press('ArrowDown');
    expect(document.activeElement).toBe(rows()[1]);
    press('ArrowUp');
    press('ArrowUp');
    expect(document.activeElement).toBe(input());
    key('ArrowDown');
    press('Escape');
    expect(element.querySelector('#gs-panel')).toBeNull();
    expect(document.activeElement).toBe(input());
  });

  it('announces searching, suggestions ready and no match through the live region', async () => {
    const announce = vi
      .spyOn(TestBed.inject(LiveAnnouncer), 'announce')
      .mockResolvedValue(undefined);
    await type('ash');
    const said = () => announce.mock.calls.map((call) => call[0]);
    expect(said()).toContain('Searching…');
    expect(said().at(-1)).toBe(
      'Suggestions ready. Use the up and down arrows to move through them.',
    );
    expect(said().join(' ')).not.toMatch(/\d/);
    suggestCards.mockReturnValueOnce(of([]));
    await type('zzz');
    expect(said().at(-1)).toBe('No Yu-Gi-Oh! card matches ‘zzz’.');
    // No role of its own on the page (the visible lines are plain text).
    expect(element.querySelectorAll('[role="status"]').length).toBe(0);
  });

  it('opens free text on Search › Cards, and Esc closes the list', async () => {
    await type('yubel');
    key('Enter');
    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: { tab: 'cards', q: 'yubel' },
    });
    await type('yubel');
    key('Escape');
    expect(element.querySelector('#gs-panel')).toBeNull();
  });

  it('takes over the early field it replaced: its focus and what was typed', async () => {
    const handoff = TestBed.inject(ShellLayout).searchHandoff;
    handoff.focused = true;
    handoff.text = 'ash';
    const second = TestBed.createComponent(GlobalSearchComponent);
    document.body.appendChild(second.nativeElement);
    second.detectChanges();
    await second.whenStable();
    const field = (second.nativeElement as HTMLElement).querySelector('input')!;
    expect(field.value).toBe('ash');
    expect(document.activeElement).toBe(field);
    expect(handoff).toEqual({ focused: false, text: '' });
    (second.nativeElement as HTMLElement).remove();
  });

  it('says when nothing matches, and offers Try again when the search fails', async () => {
    suggestCards.mockReturnValueOnce(of([]));
    await type('zzz');
    expect(element.textContent).toContain('No Yu-Gi-Oh! card matches ‘zzz’');
    expect(element.textContent).toContain('Try fewer letters, or the code printed on the card');
    suggestCards.mockReturnValueOnce(throwError(() => new Error('down')));
    await type('zzzz');
    expect(element.querySelector('.gs__error')?.textContent).toContain('Try again');
  });
});
