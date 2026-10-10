import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CardDetail, CatalogService, MarketPriceSourceEnum as Source } from '@orenji/api-client';
import { of } from 'rxjs';
import { GamesStore } from '../../../shared/catalog/games.store';
import { WishlistActions } from '../../../shared/wishlist/wishlist-actions.service';
import { CardDetailPageComponent } from './card-detail-page.component';

/** Fictional card: one code shared by a 1st Edition and an Unlimited printing, plus a rarer one. */
const CARD: CardDetail = {
  id: 'c1',
  game: 'yugioh',
  name: 'Mirrorblade Knight',
  slug: 'mirrorblade-knight',
  primaryImageUrl: '/card.svg',
  printings: [
    {
      id: 'p1',
      cardId: 'c1',
      setId: 's1',
      setCode: 'SHV',
      setName: 'Shadowvale Legacy',
      collectorNumber: 'EN003',
      printingCode: 'SHV-EN003',
      rarity: 'Super Rare',
      edition: 'FIRST_EDITION',
      language: 'en',
      finish: 'NORMAL',
      marketPrice: {
        amount: 6.75,
        currency: 'CAD',
        source: Source.Sample,
        updatedAt: '2026-09-01T00:00:00Z',
      },
    },
    {
      id: 'p2',
      cardId: 'c1',
      setId: 's1',
      setCode: 'SHV',
      setName: 'Shadowvale Legacy',
      collectorNumber: 'EN003',
      printingCode: 'SHV-EN003',
      rarity: 'Super Rare',
      edition: 'UNLIMITED',
      language: 'en',
      finish: 'NORMAL',
      marketPrice: { amount: 5.4, currency: 'CAD', source: Source.Sample },
    },
    {
      id: 'p3',
      cardId: 'c1',
      setId: 's2',
      setCode: 'SHX',
      setName: 'Shadowvale Extras',
      collectorNumber: 'EN010',
      printingCode: 'SHX-EN010',
      rarity: 'Secret Rare',
      edition: 'UNLIMITED',
      language: 'en',
      finish: 'NORMAL',
    },
  ],
} as CardDetail;

describe('CardDetailPageComponent', () => {
  let fixture: ComponentFixture<CardDetailPageComponent>;
  let element: HTMLElement;
  let wishlist: { opening: ReturnType<typeof signal<boolean>>; add: ReturnType<typeof vi.fn> };

  async function render(query: { printing?: string; rarity?: string } = {}): Promise<void> {
    fixture = TestBed.createComponent(CardDetailPageComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('id', 'c1');
    fixture.componentRef.setInput('printing', query.printing);
    fixture.componentRef.setInput('rarity', query.rarity);
    await fixture.whenStable();
  }

  function heading(): string | undefined {
    return element.querySelector('#selected-printing-title')?.textContent?.trim();
  }

  function highlightedRows(): number {
    return element.querySelectorAll('.printings__row--selected').length;
  }

  beforeEach(() => {
    wishlist = { opening: signal(false), add: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CatalogService, useValue: { getCard: vi.fn(() => of(CARD)) } },
        { provide: GamesStore, useValue: { load: vi.fn(), schema: () => null } },
        { provide: WishlistActions, useValue: wishlist },
      ],
    });
  });

  it('shows "Any printing" for ?printing=any: nothing selected, highlighted or priced', async () => {
    await render({ printing: 'any' });
    expect(heading()).toBe('Any printing');
    const block = element.querySelector('[data-testid="selected-any"]');
    expect(block?.textContent?.replace(/\s+/g, ' ')).toContain(
      '3 printings of this card: any of them fits.',
    );
    expect(element.textContent).not.toContain('Selected printing');
    expect(element.querySelector('[data-testid="selected-price"]')).toBeNull();
    expect(element.querySelector('.detail__caption')?.textContent?.trim()).toBe('Any printing');
    expect(highlightedRows()).toBe(0);
    expect(element.querySelector('tr[aria-current]')).toBeNull();
    expect(element.querySelector('.printings__pick[aria-pressed="true"]')).toBeNull();
    // The hero shows the card's own picture, not one printing's.
    expect(element.querySelector('[data-testid="card-hero-image"] img')?.getAttribute('alt')).toBe(
      'Mirrorblade Knight',
    );
    // "Add to wishlist" starts on the same choice.
    element
      .querySelectorAll<HTMLButtonElement>('.detail__ctas button')
      .forEach((button) => button.click());
    expect(wishlist.add).toHaveBeenCalledWith({ cardId: 'c1', printingId: null, rarity: null });
    // "Add to inventory" names no printing (the card has several).
    const inventory = element.querySelector<HTMLAnchorElement>(
      '.detail__ctas a[href^="/inventory"]',
    );
    expect(inventory?.getAttribute('href')).toBe('/inventory?card=c1');
  });

  it('keeps the two other link shapes: one printing, and any printing in a rarity', async () => {
    await render({ printing: 'p2' });
    expect(heading()).toBe('Selected printing');
    expect(element.querySelector('[data-testid="selected-any"]')).toBeNull();
    expect(element.querySelector('[data-testid="selected-price"]')?.textContent).toContain(
      '5.40 CAD',
    );
    expect(element.querySelector('tr[aria-current]')?.textContent).toContain('Unlimited');
    expect(highlightedRows()).toBe(1);

    await render({ rarity: 'Super Rare' });
    expect(heading()).toBe('Any printing in Super Rare');
    expect(element.querySelector('[data-testid="selected-rarity"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="selected-any"]')).toBeNull();
    expect(element.querySelector('[data-testid="selected-price"]')).toBeNull();
    expect(highlightedRows()).toBe(2);
    expect(element.querySelector('tr[aria-current]')).toBeNull();
  });

  it('lets a rarity next to ?printing=any win, and ignores an unknown one', async () => {
    await render({ printing: 'any', rarity: 'Secret Rare' });
    expect(heading()).toBe('Any printing in Secret Rare');
    await render({ printing: 'any', rarity: 'Ghost Rare' });
    expect(heading()).toBe('Any printing');
    expect(highlightedRows()).toBe(0);
  });

  it('replaces "any" with the printing the collector chooses in the table', async () => {
    await render({ printing: 'any' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    element.querySelectorAll<HTMLButtonElement>('.printings__pick')[1].click();
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { printing: 'p2', rarity: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('still shows the first printing without any parameter (stage S3 changes that default)', async () => {
    await render();
    expect(heading()).toBe('Selected printing');
    expect(element.querySelector('[data-testid="selected-price"]')?.textContent).toContain(
      '6.75 CAD',
    );
  });
});
