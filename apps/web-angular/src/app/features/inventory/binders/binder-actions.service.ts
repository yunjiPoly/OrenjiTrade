import { Injectable, Injector, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import type { BinderResponse, InventoryItemResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError } from '../../../core/http/api-error';
import { friendlyError } from '../../../core/http/api-error-messages';
import { isLimitReached } from '../../../core/limits/limit-reached';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { BINDER_COPY } from '../data/binder-form';
import { reorderWithinGame } from '../data/binder-games';
import { InventoryStore } from '../data/inventory.store';
import {
  NewBinderData,
  NewBinderDialogComponent,
  NewBinderResult,
} from './new-binder-dialog.component';

/**
 * Binder actions shared by the pane, the binder strip and the Binders tab (spec 9.2 and 9.12): New
 * binder, Make public or private, Move up or down, delete (with a confirmation), confirm; each
 * with a toast. A reached usage limit has its own words or dialog.
 */
@Injectable()
export class BinderActionsService {
  private readonly store = inject(InventoryStore);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);
  private readonly injector = inject(Injector);

  /** New binder (from a selection: its cards of the binder's game move in). */
  async create(data: NewBinderData = {}): Promise<NewBinderResult | undefined> {
    const result = await firstValueFrom(
      this.dialog
        .open<NewBinderDialogComponent, NewBinderData, NewBinderResult>(NewBinderDialogComponent, {
          data,
          panelClass: 'app-dialog--form',
          injector: this.injector,
          autoFocus: false,
          restoreFocus: true,
          ariaLabelledBy: 'new-binder-title',
        })
        .afterClosed(),
    );
    if (result) {
      this.toasts.show({
        title: `${result.binder.name} created`,
        sub: result.moved > 0 ? `${result.moved} ${result.moved === 1 ? 'card' : 'cards'} moved in.` : null,
      });
    }
    return result;
  }

  /** Make public (until made private) or private again. */
  async toggleVisibility(binder: BinderResponse): Promise<boolean> {
    const toPublic = binder.visibility === 'PRIVATE';
    return this.run(
      () =>
        toPublic
          ? this.store.publishBinder(binder.id, 'UNTIL_DISABLED')
          : this.store.unpublishBinder(binder.id),
      toPublic ? `${binder.name} is public` : `${binder.name} is private`,
    );
  }

  async confirm(binder: BinderResponse): Promise<boolean> {
    return this.run(
      () => this.store.confirmBinder(binder.id),
      `${binder.name} and its cards are confirmed as still available`,
    );
  }

  /** Move up / Move down, or a drop at a new place, within the binder's game. */
  async move(binder: BinderResponse, offset: number): Promise<void> {
    const binders = this.store.binders() ?? [];
    const ids = reorderWithinGame(binders, binder.id, offset);
    if (ids.join() === binders.map((b) => b.id).join()) {
      return;
    }
    try {
      await this.store.reorderBinders(ids);
    } catch (error) {
      this.toasts.show({ title: friendlyError(error as ApiError).message, tone: 'error' });
    }
  }

  /** "Delete {name}?"; the cards stay in the inventory, unfiled. Resolves true once deleted. */
  async remove(binder: BinderResponse): Promise<boolean> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: `Delete ${binder.name}?`,
            message: binder.sellsAsCore ? BINDER_COPY.deleteBodyCore : BINDER_COPY.deleteBodyPlain,
            confirmLabel: 'Delete binder',
            cancelLabel: 'Keep it',
            tone: 'danger',
          },
          panelClass: 'app-dialog--confirm',
          injector: this.injector,
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return false;
    }
    return this.run(() => this.store.deleteBinder(binder.id), 'Binder deleted');
  }

  /** The selection, for New binder… of the bulk dock. */
  selectionOf(ids: ReadonlySet<string>): InventoryItemResponse[] {
    return this.store.items().filter((item) => ids.has(item.id));
  }

  private async run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    try {
      await action();
      this.toasts.show({ title: success });
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      if (!isLimitReached(apiError)) {
        this.toasts.show({ title: friendlyError(apiError).message, tone: 'error' });
      }
      return false;
    }
  }
}
