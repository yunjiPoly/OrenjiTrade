import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CardDetail, CatalogService, WishPriceTerm, WishlistService } from '@orenji/api-client';
import { Observable, of, throwError } from 'rxjs';
import { WishlistDialogData, WishlistItemDialogComponent } from './wishlist-item-dialog.component';

const TERMS: WishPriceTerm[] = [{ label: '85% TCG', percent: 85, orMore: false }];

const CARD: CardDetail = {
  id: 'c1',
  game: 'yugioh',
  name: 'Azure-Eyes Sky Dragon',
  slug: 'azure-eyes-sky-dragon',
  printings: [
    {
      id: 'p1',
      cardId: 'c1',
      setId: 's1',
      setCode: 'AZR',
      setName: 'Azure Dawn',
      printingCode: 'AZR-EN001',
      rarity: 'Ultra Rare',
      edition: 'FIRST_EDITION',
      language: 'en',
      finish: 'NORMAL',
    },
  ],
} as CardDetail;

function problem(
  status: number,
  errorCode: string,
  message: string,
  fieldErrors?: { field: string; message: string }[],
): Observable<never> {
  return throwError(
    () =>
      new HttpErrorResponse({
        status,
        error: { status, errorCode, message, ...(fieldErrors ? { errors: fieldErrors } : {}) },
      }),
  );
}

describe('WishlistItemDialogComponent', () => {
  let fixture: ComponentFixture<WishlistItemDialogComponent>;
  let element: HTMLElement;
  let wishlist: { createWishlistItem: ReturnType<typeof vi.fn>; listWishPriceTerms: unknown };
  let close: ReturnType<typeof vi.fn>;

  async function create(data: WishlistDialogData): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CatalogService,
          useValue: { getCard: vi.fn(() => of(CARD)), getPrinting: vi.fn() },
        },
        { provide: WishlistService, useValue: wishlist },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    fixture = TestBed.createComponent(WishlistItemDialogComponent);
    element = fixture.nativeElement as HTMLElement;
    document.body.appendChild(element);
    await fixture.whenStable();
  }

  async function submit(): Promise<void> {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    await fixture.whenStable();
  }

  beforeEach(() => {
    close = vi.fn();
    wishlist = {
      createWishlistItem: vi.fn(),
      listWishPriceTerms: vi.fn(() => of({ terms: TERMS })),
    };
  });

  afterEach(() => element?.remove());

  it('shows a refusal next to the buttons, outside the scrolling content (409)', async () => {
    wishlist.createWishlistItem.mockReturnValue(
      problem(
        409,
        'CONFLICT',
        'This card is already on your wishlist with the same printing or rarity.',
      ),
    );
    await create({ mode: 'create', cardId: 'c1' });
    await submit();
    const error = element.querySelector('[data-testid="wish-error"]');
    expect(error?.textContent).toContain('already on your wishlist');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(element.querySelector('mat-dialog-content [data-testid="wish-error"]')).toBeNull();
    // Between the content and the actions: always in view.
    expect(error?.previousElementSibling?.tagName.toLowerCase()).toBe('mat-dialog-content');
    expect(error?.nextElementSibling?.tagName.toLowerCase()).toBe('mat-dialog-actions');
    expect(close).not.toHaveBeenCalled();
  });

  it('puts a refused note next to its field, focuses it and keeps the summary short', async () => {
    wishlist.createWishlistItem.mockReturnValue(
      problem(400, 'VALIDATION_FAILED', 'Validation failed', [
        { field: 'note', message: 'contains a term that is not allowed' },
      ]),
    );
    await create({ mode: 'create', cardId: 'c1' });
    await submit();
    expect(element.querySelector('[data-testid="wish-error"]')?.textContent?.trim()).toContain(
      'Check the highlighted fields.',
    );
    expect(element.textContent).not.toContain('Validation failed');
    expect(element.textContent).toContain(
      'The note contains a word that is not allowed here. Please rephrase it.',
    );
    expect(document.activeElement).toBe(element.querySelector('textarea'));
  });

  it('moves the focus to the chosen card once the autocomplete is gone', async () => {
    await create({ mode: 'create' });
    (
      fixture.componentInstance as unknown as {
        pick(picked: { cardId: string; printingId: string | null }): void;
      }
    ).pick({ cardId: 'c1', printingId: null });
    await fixture.whenStable();
    await fixture.whenStable();
    const heading = element.querySelector<HTMLElement>('.wd__card-name');
    expect(heading?.textContent?.trim()).toBe('Azure-Eyes Sky Dragon');
    expect(document.activeElement).toBe(heading);
  });
});
