import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { BindersService, InventoryService } from '@orenji/api-client';
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
  let close: ReturnType<typeof vi.fn>;

  async function render(data: SharePickerData): Promise<void> {
    inventory = { listInventoryItems: vi.fn(() => of({ items: [ITEM], totalItems: 1 })) };
    close = vi.fn();
    TestBed.configureTestingModule({
      imports: [SharePickerDialogComponent],
      providers: [
        provideRouter([]),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
        { provide: InventoryService, useValue: inventory },
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
    expect(element.querySelector('input')?.placeholder).toBe('Search your Yu-Gi-Oh! cards');
    expect(element.textContent).toContain('Cards in your public binders');
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

  it('"Share a binder or deck core": your public binders of the room\'s game, with the price', async () => {
    await render({ mode: 'binder', other: '', room: { name: 'Yu-Gi-Oh!', game: 'yugioh' } });
    const rows = [...element.querySelectorAll<HTMLButtonElement>('.sp__row')];
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Snake-Eye core, Deck core · Yu-Gi-Oh!, $180',
    ]);
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
