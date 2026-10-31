import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SearchService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import {
  fakeGuestActions,
  provideFakeGuestActions,
} from '../../../core/guest/testing/fake-guest-actions';
import { SessionService } from '../../../core/auth/session.service';
import { ChatDrawer } from '../../messaging/chat-drawer.service';
import { WhoHasComponent } from './who-has.component';

function result(id: string, code: string, name: string, handle: string | null, note = '') {
  return {
    collector: {
      id: handle ? `u-${id}` : null,
      handle,
      displayName: handle,
      onlineStatus: 'ONLINE',
      place: {
        subdivisionCode: code,
        subdivisionName: name,
        countryCode: 'CA',
        countryName: 'Canada',
      },
    },
    item: {
      id,
      quantity: 2,
      askingPriceText: '85% TCG',
      publicNotes: note,
      printing: { printingCode: 'LAVD-EN008', rarity: 'Ultra Rare' },
    },
  };
}

describe('WhoHasComponent (spec 7.3 and 7.4)', () => {
  let fixture: ComponentFixture<WhoHasComponent>;
  let element: HTMLElement;
  let holders: ReturnType<typeof vi.fn>;
  let message: ReturnType<typeof vi.fn>;
  let cores: ReturnType<typeof vi.fn>;
  const authenticated = signal(true);
  let guest = fakeGuestActions(vi.fn);

  async function render(
    rows: unknown[],
    totalPages = 1,
    options: { region?: string; printingId?: string | null; game?: string } = {},
  ) {
    holders = vi.fn(() => of({ items: rows, page: 0, totalPages }));
    message = vi.fn();
    cores = vi.fn(() =>
      of([
        {
          id: 'core-1',
          name: 'Yubel core',
          askingPriceText: '$95',
          owner: { handle: 'duelist.jp', place: { subdivisionName: 'Quebec' } },
        },
      ]),
    );
    TestBed.configureTestingModule({
      imports: [WhoHasComponent],
      providers: [
        provideRouter([]),
        {
          provide: SearchService,
          useValue: {
            searchCardHolders: holders,
            searchDeckCores: cores,
          },
        },
        { provide: AuthService, useValue: { isAuthenticated: authenticated } },
        provideFakeGuestActions(guest),
        { provide: SessionService, useValue: { me: signal({ id: 'me' }) } },
        { provide: ChatDrawer, useValue: { message, starting: signal(null) } },
      ],
    });
    fixture = TestBed.createComponent(WhoHasComponent);
    fixture.componentRef.setInput('cardId', 'card-1');
    fixture.componentRef.setInput('cardName', 'Ash Blossom & Joyous Spring');
    fixture.componentRef.setInput('region', options.region ?? 'americas-north');
    fixture.componentRef.setInput('regionName', 'Americas (North)');
    if (options.game !== undefined) {
      fixture.componentRef.setInput('game', options.game);
    }
    if (options.printingId !== undefined) {
      fixture.componentRef.setInput('printingId', options.printingId);
    }
    fixture.componentRef.setInput('viewer', { subdivisionCode: 'CA-QC', countryCode: 'CA' });
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    authenticated.set(true);
    guest = fakeGuestActions(vi.fn);
  });

  it("asks for the holders by province without a deck core's cards, and shows no count", async () => {
    await render([
      result('1', 'CA-QC', 'Quebec', 'duelist.jp', 'NM, ships tracked'),
      result('2', 'CA-ON', 'Ontario', 'lucas.tcg'),
    ]);
    expect(holders).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 'card-1',
        region: 'americas-north',
        sort: 'province',
        excludeDeckCoreItems: true,
        page: 0,
        size: 20,
      }),
      'body',
      false,
      expect.anything(),
    );
    const titles = [...element.querySelectorAll('.wh__group-title')].map((h) =>
      h.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(titles).toEqual(['Quebec · your province', 'Ontario']);
    expect([...element.querySelectorAll('.wh__chip')].map((c) => c.textContent?.trim())).toEqual([
      'Quebec',
      'Ontario',
    ]);
    expect(element.textContent).toContain('Also in a deck core');
    expect(element.textContent).not.toMatch(/\d+ (holders|listings|results)/);
    const row = element.querySelector<HTMLElement>('[data-testid="holder-row"]')!;
    expect(row.getAttribute('tabindex')).toBe('0');
    expect(row.getAttribute('aria-describedby')).toBeTruthy();
    expect(
      element.querySelector(`#${row.getAttribute('aria-describedby')}`)?.textContent,
    ).toContain('NM, ships tracked');
    expect(element.querySelector('[data-testid="holder-price"]')?.textContent).toBe('85% TCG');
  });

  it('asks the browsed region (not the default) for the holders and the deck cores', async () => {
    await render([result('1', 'FR-IDF', 'Île-de-France', 'a')], 1, { region: 'europe' });
    expect(holders).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'card-1', region: 'europe' }),
      'body',
      false,
      expect.anything(),
    );
    expect(cores).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'card-1', region: 'europe' }),
      'body',
      false,
      expect.anything(),
    );
  });

  it('a picked printing reaches the holder search, and a new pick asks again (spec 7.3)', async () => {
    await render([result('1', 'CA-QC', 'Quebec', 'a')], 1, { printingId: 'p-azr-fr001' });
    expect(holders).toHaveBeenLastCalledWith(
      expect.objectContaining({ printingId: 'p-azr-fr001', region: 'americas-north' }),
      'body',
      false,
      expect.anything(),
    );
    expect(holders.mock.calls[0][0]).not.toHaveProperty('cardId');
    fixture.componentRef.setInput('printingId', 'p-azr-en001');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(holders).toHaveBeenLastCalledWith(
      expect.objectContaining({ printingId: 'p-azr-en001' }),
      'body',
      false,
      expect.anything(),
    );
    fixture.componentRef.setInput('printingId', null);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(holders).toHaveBeenLastCalledWith(
      expect.objectContaining({ cardId: 'card-1' }),
      'body',
      false,
      expect.anything(),
    );
  });

  it('Esc hides the full-note tooltip until the pointer or the focus leaves (SC 1.4.13)', async () => {
    await render([result('1', 'CA-QC', 'Quebec', 'a', 'NM, ships tracked')]);
    const row = element.querySelector<HTMLElement>('[data-testid="holder-row"]')!;
    row.focus();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    row.dispatchEvent(escape);
    fixture.detectChanges();
    expect(row.classList).toContain('wh__row--tip-off');
    row.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(row.classList).not.toContain('wh__row--tip-off');
  });

  it('Esc hides the tooltip of the row under the pointer, the focus elsewhere (WD review R1-4)', async () => {
    await render([result('1', 'CA-QC', 'Quebec', 'a', 'NM, ships tracked')]);
    const row = element.querySelector<HTMLElement>('[data-testid="holder-row"]')!;
    (document.activeElement as HTMLElement | null)?.blur();
    row.dispatchEvent(new MouseEvent('mouseenter'));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(row.classList).toContain('wh__row--tip-off');
    // The pointer leaves and comes back: the note shows again.
    row.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(row.classList).not.toContain('wh__row--tip-off');
    // An Esc with nothing hovered changes nothing.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(row.classList).not.toContain('wh__row--tip-off');
  });

  it("sends the card's own game with the holders and the deck cores (WD review P5)", async () => {
    await render([result('1', 'CA-QC', 'Quebec', 'a')], 1, { game: 'pokemon' });
    expect(holders).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'card-1', game: 'pokemon' }),
      'body',
      false,
      expect.anything(),
    );
    expect(cores).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'card-1', game: 'pokemon' }),
      'body',
      false,
      expect.anything(),
    );
  });

  it('one Esc hides both the focused row’s and the hovered row’s tooltip (WD review R2-1)', async () => {
    await render([
      result('1', 'CA-QC', 'Quebec', 'a', 'NM, ships tracked'),
      result('2', 'CA-ON', 'Ontario', 'b', 'Light play'),
    ]);
    const [focused, hovered] = Array.from(
      element.querySelectorAll<HTMLElement>('[data-testid="holder-row"]'),
    );
    focused.focus();
    hovered.dispatchEvent(new MouseEvent('mouseenter'));
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    focused.dispatchEvent(escape);
    fixture.detectChanges();
    expect(focused.classList).toContain('wh__row--tip-off');
    expect(hovered.classList).toContain('wh__row--tip-off');
    // A second Esc brings neither back.
    focused.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(focused.classList).toContain('wh__row--tip-off');
    expect(hovered.classList).toContain('wh__row--tip-off');
    // The pointer leaving the hovered row clears only that row's.
    hovered.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(hovered.classList).not.toContain('wh__row--tip-off');
    expect(focused.classList).toContain('wh__row--tip-off');
    focused.dispatchEvent(new FocusEvent('focusout'));
    fixture.detectChanges();
    expect(focused.classList).not.toContain('wh__row--tip-off');
  });

  it('Message opens the chat drawer about this copy, labelled with the handle and the card', async () => {
    await render([result('1', 'CA-QC', 'Quebec', 'duelist.jp')]);
    const button = element.querySelector<HTMLButtonElement>('[data-testid="holder-message"]')!;
    expect(button.getAttribute('aria-label')).toBe(
      'Message duelist.jp about Ash Blossom & Joyous Spring',
    );
    button.click();
    expect(message).toHaveBeenCalledWith({ recipientId: 'u-1', subjectItemId: '1' }, button);
  });

  it('moves between rows with the arrows (one tab stop)', async () => {
    await render([result('1', 'CA-QC', 'Quebec', 'a'), result('2', 'CA-QC', 'Quebec', 'b')]);
    const rows = [...element.querySelectorAll<HTMLElement>('[data-testid="holder-row"]')];
    rows[0].focus();
    rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(rows[1]);
    expect(rows[1].getAttribute('tabindex')).toBe('0');
    expect(rows[0].getAttribute('tabindex')).toBe('-1');
  });

  it('shows a guest "A collector"; Message and the row open the sign-in dialog (spec 14)', async () => {
    authenticated.set(false);
    await render([result('1', 'CA-QC', 'Quebec', null)]);
    expect(element.querySelector('.wh__handle')?.textContent?.trim()).toBe('A collector');
    expect(element.querySelector('.wh__online')).toBeNull();
    const button = element.querySelector<HTMLButtonElement>('[data-testid="holder-message"]')!;
    expect(button.getAttribute('aria-label')).toContain('Needs an account');
    button.click();
    expect(message).not.toHaveBeenCalled();
    expect(guest.ask).toHaveBeenCalledWith(
      { kind: 'message', listing: { itemId: expect.any(String) } },
      expect.objectContaining({
        kind: 'card',
        line: expect.stringContaining('A collector · Quebec'),
      }),
      button,
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const row = element.querySelector<HTMLElement>('[data-testid="holder-row"]')!;
    row.click();
    expect(navigate).not.toHaveBeenCalled();
    expect(guest.ask).toHaveBeenLastCalledWith(
      { kind: 'profile', listing: { itemId: expect.any(String) } },
      { kind: 'person', title: 'A collector', line: 'Quebec' },
      expect.anything(),
    );
  });

  it('says "On your wishlist" instead of offering it when the card is wished already', async () => {
    await render([]);
    fixture.componentRef.setInput('wished', true);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="who-has-wished"]')?.textContent).toContain(
      "On your wishlist · We'll tell you when someone lists it.",
    );
    expect(element.querySelector('.wh__wish')).toBeNull();
  });

  it('has the empty state with "Add to wishlist", "Load more", and an error with "Try again"', async () => {
    await render([]);
    expect(element.textContent).toContain('Nobody in Americas (North) lists this card yet.');
    expect(element.textContent).toContain("We'll tell you when someone lists it.");
    TestBed.resetTestingModule();
    await render([result('1', 'CA-QC', 'Quebec', 'a')], 3);
    expect(element.querySelector('[data-testid="who-has-more"]')).not.toBeNull();
    holders.mockReturnValueOnce(throwError(() => new Error('offline')));
    (fixture.componentInstance as unknown as { reload(): void }).reload();
    fixture.detectChanges();
    expect(element.textContent).toContain("Couldn't load who has this card.");
    expect(element.querySelector('.wh__retry')?.textContent).toContain('Try again');
  });
});
