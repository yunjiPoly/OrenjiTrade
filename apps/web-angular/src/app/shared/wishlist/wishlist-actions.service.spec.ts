import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import type { WishlistItemResponse } from '@orenji/api-client';
import { Subject, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { WishlistActions, addedMessage } from './wishlist-actions.service';

function wish(overrides: Partial<WishlistItemResponse> = {}): WishlistItemResponse {
  return {
    id: 'w1',
    game: 'pokemon',
    card: { id: 'c1', name: 'Emberfang Fox' },
    note: '',
    nearMintOnly: false,
    createdAt: '2026-09-30T10:00:00Z',
    updatedAt: '2026-09-30T10:00:00Z',
    ...overrides,
  };
}

describe('WishlistActions', () => {
  let signedIn: boolean;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };
  let router: { url: string; navigate: ReturnType<typeof vi.fn> };
  let actions$: Subject<void>;

  beforeEach(() => {
    signedIn = true;
    actions$ = new Subject();
    dialog = { open: vi.fn(() => ({ afterClosed: () => of(wish()) })) };
    snackBar = { open: vi.fn(() => ({ onAction: () => actions$ })) };
    router = { url: '/cards/c1', navigate: vi.fn(async () => true) };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { isAuthenticated: () => signedIn } },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: Router, useValue: router },
      ],
    });
  });

  it('confirms a new wish with the region alert promise (no matches any more)', () => {
    expect(addedMessage(wish())).toBe(
      "Emberfang Fox is on your wishlist. We'll tell you when a collector of your region lists it.",
    );
    expect(addedMessage(wish({ card: undefined }))).toContain('The card is on your wishlist');
  });

  it('sends signed-out visitors to sign in and back', async () => {
    signedIn = false;
    const result = await TestBed.inject(WishlistActions).add({ cardId: 'c1' });
    expect(result).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/sign-in'], {
      queryParams: { returnUrl: '/cards/c1' },
    });
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('opens the dialog on the preset selection and confirms the new wish with a link', async () => {
    const result = await TestBed.inject(WishlistActions).add({
      cardId: 'c1',
      printingId: null,
      rarity: 'Secret Rare',
    });
    expect(result?.id).toBe('w1');
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: { mode: 'create', cardId: 'c1', printingId: null, rarity: 'Secret Rare' },
      }),
    );
    expect(snackBar.open).toHaveBeenCalledWith(addedMessage(wish()), 'View', { duration: 6000 });
    actions$.next();
    expect(router.navigate).toHaveBeenCalledWith(['/wishlist']);
  });

  it('opens the edit dialog without a confirmation', async () => {
    const item = wish();
    await TestBed.inject(WishlistActions).edit(item);
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: { mode: 'edit', item } }),
    );
    expect(snackBar.open).not.toHaveBeenCalled();
  });
});
