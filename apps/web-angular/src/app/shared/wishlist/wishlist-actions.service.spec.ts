import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import type { WishlistItemResponse } from '@orenji/api-client';
import { WishlistItemResponseTradePreferenceEnum as Trade } from '@orenji/api-client';
import { Subject, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { WishlistActions, addedMessage } from './wishlist-actions.service';

function wish(overrides: Partial<WishlistItemResponse> = {}): WishlistItemResponse {
  return {
    id: 'w1',
    game: 'pokemon',
    card: { id: 'c1', name: 'Emberfang Fox' },
    currency: 'CAD',
    tradePreference: Trade.Any,
    notes: '',
    active: true,
    matchCount: 0,
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
    dialog = { open: vi.fn(() => ({ afterClosed: () => of(wish({ matchCount: 2 })) })) };
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

  it('words the confirmation after the matches found at once', () => {
    expect(addedMessage(wish())).toBe(
      "Emberfang Fox is on your wishlist. We'll tell you when a collector of your region lists it.",
    );
    expect(addedMessage(wish({ matchCount: 3 }))).toBe(
      'Emberfang Fox is on your wishlist: 3 matches in your region already.',
    );
    expect(addedMessage(wish({ active: false }))).toBe(
      'Emberfang Fox is on your wishlist (alerts paused).',
    );
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

  it('opens the dialog on the preset card and confirms the new wish with a link to it', async () => {
    const result = await TestBed.inject(WishlistActions).add({ cardId: 'c1', printingId: 'p1' });
    expect(result?.id).toBe('w1');
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: { mode: 'create', cardId: 'c1', printingId: 'p1' } }),
    );
    expect(snackBar.open).toHaveBeenCalledWith(
      'Emberfang Fox is on your wishlist: 2 matches in your region already.',
      'View',
      { duration: 6000 },
    );
    actions$.next();
    expect(router.navigate).toHaveBeenCalledWith(['/wishlist', 'w1']);
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
