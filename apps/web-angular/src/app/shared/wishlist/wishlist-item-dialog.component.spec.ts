import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CardDetail, CatalogService, WishPriceTerm, WishlistService } from '@orenji/api-client';
import { Observable, Subject, of, throwError } from 'rxjs';
import { WishlistDialogData, WishlistItemDialogComponent } from './wishlist-item-dialog.component';

const TERMS: WishPriceTerm[] = [{ label: '85% TCG', percent: 85, orMore: false }];

/** A card whose code SHV-EN003 is shared by a 1st Edition and an Unlimited printing. */
const SHARED: CardDetail = {
  id: 'c2',
  game: 'yugioh',
  name: 'Mirrorblade Knight',
  slug: 'mirrorblade-knight',
  printings: [
    {
      id: 'k1',
      cardId: 'c2',
      setId: 's2',
      setCode: 'SHV',
      setName: 'Shadowvale Legacy',
      printingCode: 'SHV-EN003',
      rarity: 'Super Rare',
      edition: 'FIRST_EDITION',
      language: 'en',
      finish: 'NORMAL',
    },
    {
      id: 'k2',
      cardId: 'c2',
      setId: 's2',
      setCode: 'SHV',
      setName: 'Shadowvale Legacy',
      printingCode: 'SHV-EN003',
      rarity: 'Super Rare',
      edition: 'UNLIMITED',
      language: 'en',
      finish: 'NORMAL',
    },
    {
      id: 'k3',
      cardId: 'c2',
      setId: 's3',
      setCode: 'SHX',
      setName: 'Shadowvale Extras',
      printingCode: 'SHX-EN010',
      rarity: 'Common',
      edition: 'UNLIMITED',
      language: 'en',
      finish: 'NORMAL',
    },
  ],
} as CardDetail;

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
  let keydowns: Subject<KeyboardEvent>;
  let dialogRef: { close: ReturnType<typeof vi.fn>; disableClose: boolean };

  async function create(data: WishlistDialogData): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CatalogService,
          useValue: {
            getCard: vi.fn(({ id }: { id: string }) => of(id === 'c2' ? SHARED : CARD)),
            getPrinting: vi.fn(),
          },
        },
        { provide: WishlistService, useValue: wishlist },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
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

  /** The copy selected in the printing picker (its checked radio). */
  function checkedCopy(): string | null {
    return (
      element
        .querySelector('app-printing-picker input[type="radio"]:checked')
        ?.getAttribute('data-testid') ??
      element
        .querySelector('app-printing-picker input[type="radio"]:checked')
        ?.closest('[data-testid]')
        ?.getAttribute('data-testid') ??
      null
    );
  }

  async function pick(picked: { cardId: string; printingCode: string | null }): Promise<void> {
    (fixture.componentInstance as unknown as { pick(picked: unknown): void }).pick(picked);
    await fixture.whenStable();
    await fixture.whenStable();
  }

  beforeEach(() => {
    close = vi.fn();
    keydowns = new Subject<KeyboardEvent>();
    dialogRef = Object.assign(
      { close, disableClose: false },
      { keydownEvents: () => keydowns.asObservable() },
    );
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

  it('keeps the keyboard focus on the save button after a refused save (409)', async () => {
    const response = new Subject<never>();
    wishlist.createWishlistItem.mockReturnValue(response);
    await create({ mode: 'create', cardId: 'c1' });
    const save = element.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    save.focus();
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    // While saving the button reads as disabled but is not natively disabled: a browser takes
    // the focus away from a disabled button, which dropped it on the page behind the dialog.
    expect(save.textContent).toContain('Saving');
    expect(save.disabled).toBe(false);
    expect(save.getAttribute('aria-disabled')).toBe('true');
    // A second submit while saving is ignored.
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(wishlist.createWishlistItem).toHaveBeenCalledTimes(1);
    response.error(
      new HttpErrorResponse({
        status: 409,
        error: { status: 409, errorCode: 'CONFLICT', message: 'Already on your wishlist.' },
      }),
    );
    await fixture.whenStable();
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="wish-error"]')?.textContent).toContain(
      'Already on your wishlist.',
    );
    expect(document.activeElement).toBe(save);
    expect(save.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('takes the focus back to the save button when a refusal left it nowhere', async () => {
    wishlist.createWishlistItem.mockReturnValue(
      problem(429, 'LIMIT_REACHED', 'You reached a plan limit.'),
    );
    await create({ mode: 'create', cardId: 'c1' });
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    await submit();
    expect(document.activeElement).toBe(element.querySelector('button[type="submit"]'));
  });

  it('starts on "Any printing" for a typed code that several printings share', async () => {
    await create({ mode: 'create' });
    await pick({ cardId: 'c2', printingCode: 'SHV-EN003' });
    // Neither the 1st Edition nor the Unlimited printing is picked for the collector.
    expect(checkedCopy()).toBe('printing-option-any');
    expect(
      element.querySelectorAll('app-printing-picker input[type="radio"]:checked'),
    ).toHaveLength(1);
    // The picker points at the code: its two printings, each with its edition, and the reason.
    expect(element.querySelector('[data-testid="printing-option-k1"]')?.textContent).toContain(
      '1st Edition',
    );
    expect(element.querySelector('[data-testid="printing-option-k2"]')?.textContent).toContain(
      'Unlimited',
    );
    expect(element.querySelector('[data-testid="printing-option-k3"]')).toBeNull();
    expect(element.querySelector('.pp__hint')?.textContent).toContain(
      '2 printings share the code SHV-EN003: choose one below for that copy only.',
    );
    // Saved as it stands, the wish is for any printing of the card.
    wishlist.createWishlistItem.mockReturnValue(of({ id: 'w1' }));
    await submit();
    expect(wishlist.createWishlistItem.mock.calls[0][0]).toEqual({
      createWishlistItemRequest: { cardId: 'c2', nearMintOnly: false },
    });
  });

  it('preselects the printing of a typed code that only one printing has', async () => {
    await create({ mode: 'create' });
    await pick({ cardId: 'c2', printingCode: 'SHX-EN010' });
    expect(checkedCopy()).toBe('printing-option-k3');
    expect(element.querySelector('.pp__hint')?.textContent).toContain('Only SHX-EN010');
    // A card suggestion (no code) is any printing.
    (fixture.componentInstance as unknown as { changeCard(): void }).changeCard();
    await pick({ cardId: 'c2', printingCode: null });
    expect(checkedCopy()).toBe('printing-option-any');
    expect(element.querySelector('[data-testid="printing-option-k3"]')).not.toBeNull();
  });

  it('does not close on a backdrop click while the form holds unsaved input', async () => {
    await create({ mode: 'create', cardId: 'c1' });
    expect(dialogRef.disableClose).toBe(false);
    const note = element.querySelector('textarea')!;
    note.value = 'A typed note';
    note.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    // MatDialog ignores the backdrop (and its own Escape handling) while disableClose is set.
    expect(dialogRef.disableClose).toBe(true);
    // Escape still closes the dialog.
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    keydowns.next(escape);
    expect(close).toHaveBeenCalledTimes(1);
    expect(escape.defaultPrevented).toBe(true);
    // Back on the initial value, the backdrop closes the dialog again.
    note.value = '';
    note.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(dialogRef.disableClose).toBe(false);
    keydowns.next(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(close).toHaveBeenCalledTimes(1);
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
    await pick({ cardId: 'c1', printingCode: null });
    const heading = element.querySelector<HTMLElement>('.wd__card-name');
    expect(heading?.textContent?.trim()).toBe('Azure-Eyes Sky Dragon');
    expect(document.activeElement).toBe(heading);
  });
});
