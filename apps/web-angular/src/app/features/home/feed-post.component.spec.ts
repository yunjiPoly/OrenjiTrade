import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FeedPost, FeedPostKindEnum as Kind } from '@orenji/api-client';
import {
  fakeGuestActions,
  provideFakeGuestActions,
} from '../../core/guest/testing/fake-guest-actions';
import { ChatDrawer } from '../../shared/messaging/chat-drawer.service';
import { IHaveIt } from '../../shared/wishlist/i-have-it.service';
import { FeedPostComponent } from './feed-post.component';

const PLACE = {
  regionCode: 'americas-north',
  countryCode: 'CA',
  countryName: 'Canada',
  subdivisionCode: 'CA-QC',
  subdivisionName: 'Quebec',
  label: 'Quebec, Canada',
};
const WHO = { id: 'u1', handle: 'maya_k', displayName: 'Maya', avatarUrl: null };
const NOW = new Date(2026, 9, 29, 15, 0);
const GUEST = { id: null, handle: null, displayName: null, avatarUrl: null };

function preview(id: string) {
  return {
    itemId: `i${id}`,
    cardId: `c${id}`,
    printingId: `p${id}`,
    name: `Card ${id}`,
    printingCode: `RA01-EN07${id}`,
    rarity: 'Secret Rare',
    imageUrl: null,
    askingPriceText: `$${id}.00`,
    currency: 'CAD',
  };
}

describe('FeedPostComponent (spec 5.2, board W1)', () => {
  let fixture: ComponentFixture<FeedPostComponent>;
  let element: HTMLElement;
  let message: ReturnType<typeof vi.fn>;
  let offer: ReturnType<typeof vi.fn>;

  let guest: ReturnType<typeof fakeGuestActions>;

  function render(post: Partial<FeedPost>): void {
    guest = fakeGuestActions(vi.fn);
    message = vi.fn(async () => undefined);
    offer = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      imports: [FeedPostComponent],
      providers: [
        provideRouter([]),
        { provide: ChatDrawer, useValue: { message, starting: signal(null) } },
        { provide: IHaveIt, useValue: { offer } },
        provideFakeGuestActions(guest),
      ],
    });
    fixture = TestBed.createComponent(FeedPostComponent);
    fixture.componentRef.setInput('post', {
      id: 'post-1',
      at: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
      collector: WHO,
      place: PLACE,
      ...post,
    } as FeedPost);
    fixture.componentRef.setInput('game', 'yugioh');
    fixture.componentRef.setInput('now', NOW);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  it('lists 12 cards as five tiles and "+7" to the profile, prices under the tiles, no count', () => {
    render({
      kind: Kind.NewCards,
      newCards: { total: 12, previews: ['1', '2', '3', '4', '5', '6'].map(preview) },
    });
    expect(element.querySelector('.fp__title')?.textContent).toContain('maya_k listed 12 cards');
    expect(element.querySelector('.fp__meta')?.textContent).toContain('5 min · Quebec');
    const tiles = [...element.querySelectorAll('.fp__tile-link')];
    expect(tiles).toHaveLength(6);
    expect(tiles[0].getAttribute('aria-label')).toBe('Card 1, $1.00');
    expect(tiles[0].getAttribute('href')).toBe('/cards/c1?printing=p1');
    expect(tiles[5].textContent).toContain('+7');
    expect(tiles[5].getAttribute('href')).toBe('/collectors/maya_k');
    expect(tiles[5].getAttribute('aria-label')).toBe('7 more cards from maya_k');
  });

  it('one card: "Message maya_k about {card}" opens the chat drawer with it as the subject', () => {
    render({ kind: Kind.NewCards, newCards: { total: 1, previews: [preview('1')] } });
    const button = element.querySelector<HTMLButtonElement>('[data-testid="feed-message"]')!;
    expect(button.getAttribute('aria-label')).toBe('Message maya_k about Card 1');
    button.click();
    expect(message).toHaveBeenCalledWith({ recipientId: 'u1', subjectItemId: 'i1' }, button);
  });

  it('a wish: the terms and "I have it" to the wisher', () => {
    render({
      kind: Kind.Wanted,
      wanted: {
        wishId: 'w1',
        cardId: 'c9',
        name: 'Ash Blossom',
        nearMintOnly: true,
        priceTerm: { label: '85% TCG' },
      } as FeedPost['wanted'],
    });
    expect(element.querySelector('.fp__verb')?.getAttribute('data-tone')).toBe('wanted');
    expect(element.querySelector('.fp__line')?.textContent).toContain(
      'Any printing · NM only · 85% TCG',
    );
    const button = element.querySelector<HTMLButtonElement>('[data-testid="feed-have-it"]')!;
    expect(button.getAttribute('aria-label')).toBe('I have it: Ash Blossom. Message maya_k');
    button.click();
    expect(offer).toHaveBeenCalledWith(
      'u1',
      { cardId: 'c9', name: 'Ash Blossom', printingId: null, rarity: null },
      button,
    );
  });

  it('a deck core opens the deck core page, with its tag, photos, price and note', () => {
    render({
      kind: Kind.DeckCore,
      deckCore: {
        binderId: 'b1',
        name: 'Yubel core',
        askingPriceText: '$95',
        photoUrl: null,
        photoCount: 0,
        previewImages: [],
        noteFirstLine: 'All NM.',
      },
    });
    const link = element.querySelector('[data-testid="feed-deck-core"]')!;
    expect(link.getAttribute('href')).toBe('/binders/b1');
    expect(link.textContent).toContain('Deck core');
    expect(link.textContent).toContain('Yubel core');
    expect(link.textContent).toContain('$95');
    expect(link.textContent).toContain('All NM.');
  });

  it('a guest reads "A collector" with a plain avatar, no profile link, the province kept (R15)', () => {
    render({
      kind: Kind.NewCards,
      collector: GUEST,
      newCards: { total: 9, previews: ['1', '2', '3', '4', '5', '6'].map(preview) },
    });
    expect(element.querySelector('.fp__title')?.textContent).toContain(
      'A collector listed 9 cards',
    );
    expect(element.querySelector('a[href^="/collectors"]')).toBeNull();
    expect(element.querySelector('.fp__avatar--guest')).not.toBeNull();
    expect(element.querySelector('.fp__meta')?.textContent).toContain('Quebec');
  });

  it('a guest\'s header and "+N" open "Sign in to see collector profiles" (spec 14, W26)', () => {
    render({
      kind: Kind.NewCards,
      collector: GUEST,
      newCards: { total: 9, previews: ['1', '2', '3', '4', '5', '6'].map(preview) },
    });
    const who = element.querySelector<HTMLButtonElement>('[data-testid="feed-guest-who"]')!;
    expect(who.getAttribute('aria-label')).toBe(
      'A collector listed 9 cards, 5 min, Quebec. Sign in to see collector profiles',
    );
    who.click();
    expect(guest.ask).toHaveBeenCalledWith(
      { kind: 'profile', listing: { itemId: 'i1' } },
      { kind: 'person', title: 'A collector', line: 'Quebec' },
      who,
    );
    const more = element.querySelector<HTMLButtonElement>('[data-testid="feed-guest-more"]')!;
    expect(more.getAttribute('aria-label')).toBe(
      '4 more cards from this collector. Needs an account',
    );
    more.click();
    expect(guest.ask).toHaveBeenCalledTimes(2);
  });

  it('a guest\'s Message and "I have it" open the dialog with the card, never the chat', () => {
    render({
      kind: Kind.NewCards,
      collector: GUEST,
      newCards: { total: 1, previews: [preview('1')] },
    });
    const button = element.querySelector<HTMLButtonElement>('[data-testid="feed-message"]')!;
    expect(button.getAttribute('aria-label')).toBe(
      'Message this collector about Card 1. Needs an account',
    );
    button.click();
    expect(message).not.toHaveBeenCalled();
    expect(guest.ask).toHaveBeenCalledWith(
      { kind: 'message', listing: { itemId: 'i1' } },
      expect.objectContaining({ title: 'Card 1', line: 'A collector · Quebec · $1.00' }),
      button,
    );
    TestBed.resetTestingModule();
    render({
      kind: Kind.Wanted,
      collector: GUEST,
      wanted: {
        wishId: 'w-1',
        cardId: 'c-9',
        name: 'Ash Blossom',
        nearMintOnly: true,
      },
    });
    const have = element.querySelector<HTMLButtonElement>('[data-testid="feed-have-it"]')!;
    expect(have.getAttribute('aria-label')).toBe('I have Ash Blossom. Needs an account');
    have.click();
    expect(offer).not.toHaveBeenCalled();
    expect(guest.ask).toHaveBeenCalledWith(
      {
        kind: 'have',
        wishId: 'w-1',
        card: { cardId: 'c-9', name: 'Ash Blossom', printingId: null, rarity: null },
      },
      expect.objectContaining({ line: 'Wanted by a collector · Quebec' }),
      have,
    );
  });
});
