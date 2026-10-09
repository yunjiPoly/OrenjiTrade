import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MarketPriceSourceEnum as Source, WishlistItemResponse } from '@orenji/api-client';
import { WishCardComponent } from './wish-card.component';

function wish(overrides: Partial<WishlistItemResponse> = {}): WishlistItemResponse {
  return {
    id: 'w1',
    game: 'yugioh',
    card: { id: 'c1', name: 'Azure-Eyes Sky Dragon', imageUrl: '/card.svg' },
    printing: {
      id: 'p1',
      printingCode: 'AZR-EN001',
      rarity: 'Ultra Rare',
      setName: 'Azure Dawn',
      images: [{ kind: 'FRONT' as never, url: '/printing.svg' }],
      marketPrice: { amount: 25, currency: 'USD', source: Source.Ygoprodeck },
    },
    note: 'For my Azure deck',
    nearMintOnly: true,
    priceTerm: { label: '85% TCG', percent: 85, orMore: false },
    createdAt: '2026-09-30T10:00:00Z',
    updatedAt: '2026-09-30T10:00:00Z',
    ...overrides,
  };
}

describe('WishCardComponent', () => {
  let fixture: ComponentFixture<WishCardComponent>;
  let element: HTMLElement;

  async function render(item: WishlistItemResponse): Promise<void> {
    fixture.componentRef.setInput('item', item);
    await fixture.whenStable();
  }

  /** The visible text of each chip (without the screen-reader detail). */
  function chips(): (string | undefined)[] {
    return Array.from(element.querySelectorAll('.wc__chip'), (chip) => {
      const visible = chip.cloneNode(true) as HTMLElement;
      visible.querySelectorAll('.visually-hidden').forEach((hidden) => hidden.remove());
      return visible.textContent?.replace(/\s+/g, ' ').trim();
    });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WishCardComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(WishCardComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('shows the card, which copy, the public note and the NM / % TCG chips', async () => {
    await render(wish());
    const link = element.querySelector<HTMLAnchorElement>('.wc__link');
    expect(link?.textContent?.trim()).toBe('Azure-Eyes Sky Dragon');
    expect(link?.getAttribute('href')).toBe('/cards/c1?printing=p1');
    expect(element.querySelector('[data-testid="wish-copy"]')?.textContent?.trim()).toBe(
      'AZR-EN001 · Ultra Rare · Azure Dawn',
    );
    expect(element.querySelector('[data-testid="wish-note-text"]')?.textContent).toContain(
      'For my Azure deck',
    );
    expect(chips()).toEqual(['verified Near Mint only', 'sell 85% TCG ≈ 21.25 USD']);
    // The amount names its price source (tooltip and screen-reader text).
    expect(element.querySelector('[data-kind="price-term"] .visually-hidden')?.textContent).toBe(
      '(TCG market price: YGOPRODeck set price (TCGplayer-based, USD))',
    );
    // Nothing of the old model: no matches, alerts switch, price limit or private note.
    expect(element.textContent).not.toMatch(/match|Alerts|Up to|Private/i);
    expect(element.querySelector('[role="switch"]')).toBeNull();
  });

  it('says "Any printing" with the rarity and shows the term alone without a printing', async () => {
    await render(
      wish({
        printing: undefined,
        rarity: 'Secret Rare',
        note: '',
        nearMintOnly: false,
        priceTerm: { label: '100% TCG+', percent: 100, orMore: true },
      }),
    );
    expect(element.querySelector('[data-testid="wish-copy"]')?.textContent?.trim()).toBe(
      'Any printing · Secret Rare',
    );
    expect(element.querySelector<HTMLAnchorElement>('.wc__link')?.getAttribute('href')).toBe(
      '/cards/c1?rarity=Secret%20Rare',
    );
    expect(element.querySelector('[data-testid="wish-note-text"]')).toBeNull();
    expect(chips()).toEqual(['sell 100% TCG+']);
    expect(element.querySelector('.wc__chip .visually-hidden')).toBeNull();
  });

  it('emits edit and remove', async () => {
    await render(wish());
    const edited = vi.fn();
    const removed = vi.fn();
    fixture.componentInstance.edit.subscribe(edited);
    fixture.componentInstance.remove.subscribe(removed);
    const buttons = element.querySelectorAll<HTMLButtonElement>('.wc__foot button');
    // Named with which copy: two wishes can name the same card.
    expect(buttons[0].getAttribute('aria-label')).toBe(
      'Edit the wish for Azure-Eyes Sky Dragon (AZR-EN001 · Ultra Rare · Azure Dawn)',
    );
    expect(buttons[1].getAttribute('aria-label')).toBe(
      'Remove Azure-Eyes Sky Dragon (AZR-EN001 · Ultra Rare · Azure Dawn) from your wishlist',
    );
    buttons[0].click();
    buttons[1].click();
    expect(edited).toHaveBeenCalled();
    expect(removed).toHaveBeenCalled();
  });
});
