import { Injectable, Injector, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import type { WishlistItemResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import type { WishlistDialogData } from './wishlist-item-dialog.component';
import { matchCountLabel } from './wishlist-labels';

/** What the add dialog starts from: a card (any printing) and/or one printing. */
export interface WishPreset {
  cardId?: string | null;
  printingId?: string | null;
}

/** The snack-bar confirmation of a new wish. */
export function addedMessage(item: WishlistItemResponse): string {
  const name = item.card?.name ?? 'The card';
  if (item.matchCount > 0) {
    return `${name} is on your wishlist: ${matchCountLabel(item.matchCount)} in your region already.`;
  }
  return item.active
    ? `${name} is on your wishlist. We'll tell you when a collector of your region lists it.`
    : `${name} is on your wishlist (alerts paused).`;
}

/**
 * "Add to wishlist" from anywhere (wishlist page, card detail, card holders, map): opens the
 * add/edit dialog (a lazy chunk), sends signed-out visitors to sign in first, and confirms a new
 * wish with a snack bar that links to it.
 */
@Injectable({ providedIn: 'root' })
export class WishlistActions {
  private readonly injector = inject(Injector);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  private readonly openingState = signal(false);
  /** The dialog chunk is loading (buttons show progress). */
  readonly opening = this.openingState.asReadonly();

  /**
   * Opens the add dialog; resolves the new wish, or `null` (cancelled, signed out). With
   * `confirm`, a snack bar confirms it with a "View" action opening its matches.
   */
  async add(preset: WishPreset = {}, confirm = true): Promise<WishlistItemResponse | null> {
    if (!this.auth.isAuthenticated()) {
      await this.router.navigate(['/auth/sign-in'], {
        queryParams: { returnUrl: this.router.url },
      });
      return null;
    }
    const item = await this.open({ mode: 'create', ...preset });
    if (item && confirm) {
      this.snackBar
        .open(addedMessage(item), 'View', { duration: 6000 })
        .onAction()
        .subscribe(() => void this.router.navigate(['/wishlist', item.id]));
    }
    return item;
  }

  /** Opens the edit dialog; resolves the updated wish, or `null` when cancelled. */
  edit(item: WishlistItemResponse): Promise<WishlistItemResponse | null> {
    return this.open({ mode: 'edit', item });
  }

  private async open(data: WishlistDialogData): Promise<WishlistItemResponse | null> {
    this.openingState.set(true);
    try {
      const { openWishlistDialog } = await import('./wishlist-item-dialog.component');
      this.openingState.set(false);
      const result = await firstValueFrom(openWishlistDialog(this.injector, data).afterClosed());
      return result ?? null;
    } finally {
      this.openingState.set(false);
    }
  }
}
