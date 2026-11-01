import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { BindersService, CatalogService, InventoryService } from '@orenji/api-client';
import { of } from 'rxjs';
import { SharePickerData, SharePickerDialogComponent } from './share-picker-dialog.component';

const ITEM = {
  id: 'item-1',
  card: { id: 'card-1', name: 'Lantern Fox Spirit', game: 'yugioh' },
  printing: { id: 'pr-1', printingCode: 'AZR-EN011', images: [] },
  binder: { name: 'Trade binder' },
  askingPrice: 16,
  currency: 'CAD',
};

describe('SharePickerDialogComponent in a community room (web WF, board W22)', () => {
  let fixture: ComponentFixture<SharePickerDialogComponent>;
  let element: HTMLElement;
  let inventory: { listInventoryItems: ReturnType<typeof vi.fn> };
  let catalog: { suggestCards: ReturnType<typeof vi.fn>; getCard: ReturnType<typeof vi.fn> };
  let close: ReturnType<typeof vi.fn>;

  async function render(data: SharePickerData): Promise<void> {
    inventory = { listInventoryItems: vi.fn(() => of({ items: [ITEM], totalItems: 1 })) };
    catalog = {
      suggestCards: vi.fn(() =>
        of([
          {
            kind: 'CARD',
            id: 'card-moth',
            name: 'Moth Queen',
            game: 'yugioh',
            printingCode: 'MQ-EN001',
            imageUrl: '/api/v1/public/card-images/moth',
          },
        ]),
      ),
      getCard: vi.fn(() =>
        of({
          id: 'card-moth',
          printings: [{ id: 'pr-moth-2' }, { id: 'pr-moth', printingCode: 'MQ-EN001' }],
        }),
      ),
    };
    close = vi.fn();
    TestBed.configureTestingModule({
      imports: [SharePickerDialogComponent],
      providers: [
        provideRouter([]),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
        { provide: InventoryService, useValue: inventory },
        { provide: CatalogService, useValue: catalog },
        {
          provide: BindersService,
          useValue: {
            listMyBinders: () =>
              of([
                {
                  id: 'b-1',
                  name: 'Snake-Eye core',
                  game: 'yugioh',
                  effectivePublic: true,
                  sellsAsCore: true,
                  askingPriceText: '$180',
                  itemCount: 12,
                },
                {
                  id: 'b-2',
                  name: 'Pokémon binder',
                  game: 'pokemon',
                  effectivePublic: true,
                  itemCount: 4,
                },
                {
                  id: 'b-3',
                  name: 'Private one',
                  game: 'yugioh',
                  effectivePublic: false,
                  itemCount: 2,
                },
              ]),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(SharePickerDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  it('"Share a card": your public cards of the room\'s game, chosen as their printing', async () => {
    await render({ mode: 'card', other: '', room: { name: 'Yu-Gi-Oh!', game: 'yugioh' } });
    expect(element.querySelector('h2')?.textContent).toContain('Share a card');
    expect(element.textContent).toContain('Everyone in this room can see it and open it.');
    expect(element.querySelector('input')?.placeholder).toBe(
      'Search your Yu-Gi-Oh! cards or any card',
    );
    expect(element.textContent).toContain('Cards in your public binders, then any card');
    expect(inventory.listInventoryItems).toHaveBeenCalledWith(
      expect.objectContaining({ game: 'yugioh', markedPublic: true }),
      'body',
      false,
      expect.anything(),
    );
    element.querySelector<HTMLButtonElement>('.sp__row')!.click();
    expect(close).toHaveBeenCalledWith({
      kind: 'card',
      card: {
        printingId: 'pr-1',
        cardId: 'card-1',
        name: 'Lantern Fox Spirit',
        printingCode: 'AZR-EN011',
        imageUrl: null,
        game: 'yugioh',
      },
    });
  });

  it('"Share a card" also finds any card of the catalogue, one you do not own (WF review F1)', async () => {
    await render({ mode: 'card', other: '', room: { name: 'Yu-Gi-Oh!', game: 'yugioh' } });
    const all = element.querySelector('[data-testid="share-all-cards"]')!;
    expect(all.querySelector('h3')?.textContent).toContain('All cards');
    expect(all.textContent).toContain('Type two letters or more');
    inventory.listInventoryItems.mockReturnValue(of({ items: [], totalItems: 0 }));
    const input = element.querySelector('input')!;
    input.value = 'Moth';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    fixture.detectChanges();
    expect(catalog.suggestCards).toHaveBeenCalledWith(
      { q: 'Moth', limit: 8 },
      'body',
      false,
      expect.anything(),
    );
    expect(element.textContent).toContain('None of your public Yu-Gi-Oh! cards match “Moth”.');
    const rows = [...all.querySelectorAll<HTMLButtonElement>('.sp__row')];
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Moth Queen, Yu-Gi-Oh! · MQ-EN001',
    ]);
    // The rows follow your own in the arrows' order (none of yours match: it is the first).
    expect(rows[0].getAttribute('data-row')).toBe('0');
    rows[0].click();
    await fixture.whenStable();
    expect(catalog.getCard).toHaveBeenCalledWith(
      { id: 'card-moth' },
      'body',
      false,
      expect.anything(),
    );
    expect(close).toHaveBeenCalledWith({
      kind: 'card',
      card: {
        printingId: 'pr-moth',
        cardId: 'card-moth',
        name: 'Moth Queen',
        printingCode: 'MQ-EN001',
        imageUrl: '/api/v1/public/card-images/moth',
        game: 'yugioh',
      },
    });
  });

  it('a chat has no catalogue search (WC)', async () => {
    await render({ mode: 'card', other: 'theo.duels' });
    expect(element.querySelector('[data-testid="share-all-cards"]')).toBeNull();
  });

  it('"Share a binder or deck core": every public binder, the room\'s game first, with the price (WF review R1-3)', async () => {
    await render({ mode: 'binder', other: '', room: { name: 'Pokémon', game: 'pokemon' } });
    const labels = () =>
      [...element.querySelectorAll<HTMLButtonElement>('.sp__row')].map((row) =>
        row.getAttribute('aria-label'),
      );
    // The room's game first, then the other public binders, each line naming its own game.
    expect(labels()).toEqual([
      'Pokémon binder, Public binder · Pokémon',
      'Snake-Eye core, Deck core · Yu-Gi-Oh!, $180',
    ]);
    expect(element.querySelector('input')?.placeholder).toBe('Search your binders');
    const search = element.querySelector('input')!;
    search.value = 'Singles';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.textContent).toContain('None of your public binders match “Singles”.');
    search.value = 'snake';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const rows = [...element.querySelectorAll<HTMLButtonElement>('.sp__row')];
    expect(labels()).toEqual(['Snake-Eye core, Deck core · Yu-Gi-Oh!, $180']);
    rows[0].click();
    expect(close).toHaveBeenCalledWith({
      kind: 'binder',
      binder: { binderId: 'b-1', name: 'Snake-Eye core', itemCount: 12 },
      deckCore: true,
      price: '$180',
    });
  });

  it('a chat keeps its own words and choices (WC)', async () => {
    await render({ mode: 'card', other: 'theo.duels' });
    expect(element.querySelector('h2')?.textContent).toContain('Share a card from your inventory');
    element.querySelector<HTMLButtonElement>('.sp__row')!.click();
    expect(close).toHaveBeenCalledWith({
      kind: 'item',
      itemId: 'item-1',
      name: 'Lantern Fox Spirit',
    });
  });
});
