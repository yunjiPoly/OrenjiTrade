import { Injectable, Injector, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import type { InventoryItemResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError } from '../../../core/http/api-error';
import { friendlyError } from '../../../core/http/api-error-messages';
import { isLimitReached } from '../../../core/limits/limit-reached';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { BulkAction, bulkOutcome, cardsLabel, hiddenAfterPublic } from './bulk-actions';
import { InventoryStore } from './inventory.store';

/** The server keeps a deleted card 10 minutes for an undo. */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

/** Words of a binder's game errors (stage G 409s, spec 9.12). */
export function binderGameError(error: ApiError, gameLabel: string | null): string | null {
  if (error.errorCode === 'BINDER_GAME_MISMATCH') {
    return gameLabel
      ? `Only ${gameLabel} cards can go in this binder.`
      : "Only cards of this binder's game can go in it.";
  }
  if (error.errorCode === 'BINDER_GAME_LOCKED') {
    return gameLabel
      ? `This binder already has ${gameLabel} cards, so its game can't change.`
      : "This binder already has cards, so its game can't change.";
  }
  return null;
}

/**
 * The actions of Inventory that end in a toast (spec 9.4 to 9.8): deletes with "Undo" (one restore
 * per card until a bulk restore exists, decision 19), bulk actions with words that name what
 * changed and why, inline saves that restore the old value on a failure, and Ctrl/Cmd+Z, which
 * repeats the last Undo while the server still keeps the cards (spec 4.9).
 */
@Injectable()
export class InventoryActions {
  private readonly store = inject(InventoryStore);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);
  private readonly injector = inject(Injector);
  private lastUndo: { run: () => Promise<void>; until: number } | null = null;

  /** Whether an Undo is still waiting (Ctrl/Cmd+Z then does it). */
  hasUndo(now = Date.now()): boolean {
    return !!this.lastUndo && this.lastUndo.until >= now;
  }

  /** Ctrl/Cmd+Z (outside a text field): the last Undo, within the server's 10 minutes. */
  async undoLast(now = Date.now()): Promise<boolean> {
    const undo = this.lastUndo;
    if (!undo || undo.until < now) {
      this.lastUndo = null;
      return false;
    }
    this.lastUndo = null;
    await undo.run();
    return true;
  }

  /** "Delete {name}?" then "Card deleted" [Undo]. Resolves true once deleted. */
  async deleteOne(item: InventoryItemResponse): Promise<boolean> {
    const confirmed = await this.confirm({
      title: `Delete ${item.card.name}?`,
      message: 'It leaves your inventory and any binder. Its photos are deleted too.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!confirmed) {
      return false;
    }
    try {
      await this.store.deleteItem(item.id);
    } catch (error) {
      this.fail(error);
      return false;
    }
    this.offerUndo('Card deleted', null, [item.id]);
    return true;
  }

  /** A bulk action on the selection, with its result toast (spec 9.6). */
  async bulk(action: BulkAction, ids: readonly string[]): Promise<boolean> {
    if (ids.length === 0) {
      return false;
    }
    if (action.kind === 'delete') {
      const confirmed = await this.confirm({
        title: `Delete ${cardsLabel(ids.length)}?`,
        message: 'They leave your inventory and any binder. Their photos are deleted too.',
        confirmLabel: 'Delete',
        cancelLabel: 'Keep them',
        tone: 'danger',
      });
      if (!confirmed) {
        return false;
      }
    }
    const items = this.store.items();
    try {
      const response = await this.store.bulk(action, ids);
      if (action.kind === 'delete') {
        const skipped = new Set(response.skipped.map((entry) => entry.itemId));
        const deleted = ids.filter((id) => !skipped.has(id));
        const outcome = bulkOutcome(action, response, items);
        this.offerUndo(outcome.title, outcome.sub, deleted);
        return true;
      }
      const outcome = bulkOutcome(action, response, items);
      if (action.kind === 'visibility' && action.visibility !== 'PRIVATE' && response.updated > 0) {
        await this.explainHidden(outcome.title, ids);
        return true;
      }
      this.toasts.show({
        title: outcome.title,
        sub: outcome.sub,
        tone: response.updated ? 'success' : 'info',
      });
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  /**
   * An inline save (spec 9.4): on a failure the old value comes back (the row was never changed)
   * and the toast offers "Try again".
   */
  async inline(
    what: 'price' | 'copies' | 'visibility' | 'binder',
    save: () => Promise<unknown>,
  ): Promise<boolean> {
    try {
      await save();
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      if (isLimitReached(apiError)) {
        return false;
      }
      const label = {
        price: 'the price',
        copies: 'the copies',
        visibility: 'who can see it',
        binder: 'the binder',
      }[what];
      const game = binderGameError(apiError, null);
      const ref = this.toasts.show({
        title: `Couldn't save ${label}.`,
        sub: game ?? friendlyError(apiError).message,
        action: 'Try again',
        tone: 'error',
      });
      ref.onAction().subscribe(() => void this.inline(what, save));
      return false;
    }
  }

  /** "Still have it": one card confirmed as still available. */
  async confirmOne(item: InventoryItemResponse): Promise<void> {
    try {
      await this.store.confirmItem(item.id);
      this.toasts.show({ title: 'Confirmed', sub: `${item.card.name} stays in search.` });
    } catch (error) {
      this.fail(error);
    }
  }

  /** "Still have them" of the freshness banner. */
  async confirmAll(): Promise<void> {
    try {
      const response = await this.store.confirmAllStale();
      const outcome = bulkOutcome({ kind: 'confirm' }, response);
      this.toasts.show({ title: outcome.title, sub: outcome.sub });
    } catch (error) {
      this.fail(error);
    }
  }

  /** An error toast in plain words (a reached limit has its own dialog). */
  fail(error: unknown): void {
    const apiError = error as ApiError;
    if (isLimitReached(apiError)) {
      return;
    }
    this.toasts.show({
      title: binderGameError(apiError, null) ?? friendlyError(apiError).message,
      tone: 'error',
    });
  }

  private async explainHidden(title: string, ids: readonly string[]): Promise<void> {
    // The answer has the cards' new state once the list reloaded.
    const items = await this.reloaded();
    const privateBinders = new Set(
      (this.store.binders() ?? []).filter((b) => b.visibility === 'PRIVATE').map((b) => b.id),
    );
    const hidden = hiddenAfterPublic(items, ids, privateBinders);
    if (hidden.count === 0) {
      this.toasts.show({ title });
      return;
    }
    const binder = hidden.binderId ? this.store.bindersById().get(hidden.binderId) : null;
    const sub =
      hidden.inPrivateBinder === hidden.count
        ? `${hidden.count} ${hidden.count === 1 ? 'is' : 'are'} in a private binder, so nobody sees ${hidden.count === 1 ? 'it' : 'them'} yet.`
        : `${hidden.count} ${hidden.count === 1 ? "isn't" : "aren't"} visible yet. Put them in a public binder or choose your province.`;
    const ref = this.toasts.show({
      title,
      sub,
      action: binder ? 'Make the binder public' : null,
      duration: 10000,
    });
    if (binder) {
      ref.onAction().subscribe(async () => {
        try {
          await this.store.publishBinder(binder.id, 'UNTIL_DISABLED');
          this.toasts.show({ title: `${binder.name} is public` });
        } catch (error) {
          this.fail(error);
        }
      });
    }
  }

  private reloaded(): Promise<InventoryItemResponse[]> {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        if (!this.store.itemsLoading() || Date.now() - started > 4000) {
          resolve(this.store.items());
        } else {
          setTimeout(check, 100);
        }
      };
      setTimeout(check, 50);
    });
  }

  private offerUndo(title: string, sub: string | null, ids: readonly string[]): void {
    if (ids.length === 0) {
      this.toasts.show({ title, sub, tone: 'info' });
      return;
    }
    const run = async () => {
      const { restored, failed } = await this.store.restoreItems(ids);
      if (failed > 0 && restored === 0) {
        this.toasts.show({
          title:
            ids.length === 1
              ? 'This card can no longer be restored.'
              : 'These cards can no longer be restored.',
          tone: 'error',
        });
        return;
      }
      this.toasts.show({
        title: restored === 1 ? 'Card restored' : `${cardsLabel(restored)} restored`,
        sub: failed > 0 ? `${cardsLabel(failed)} could no longer be restored.` : null,
      });
    };
    this.lastUndo = { run, until: Date.now() + UNDO_WINDOW_MS };
    const ref = this.toasts.show({ title, sub, action: 'Undo' });
    ref.onAction().subscribe(() => {
      if (this.lastUndo?.run === run) {
        this.lastUndo = null;
      }
      void run();
    });
  }

  private confirm(data: ConfirmDialogData): Promise<boolean> {
    return firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data,
          panelClass: 'app-dialog--confirm',
          injector: this.injector,
          autoFocus: 'first-tabbable',
          restoreFocus: true,
        })
        .afterClosed(),
    ).then((result) => !!result);
  }
}
