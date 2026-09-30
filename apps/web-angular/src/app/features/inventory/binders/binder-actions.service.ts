import { Injectable, Injector, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { BinderResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../../../core/http/api-error';
import { friendlyError } from '../../../core/http/api-error-messages';
import { isLimitReached } from '../../../core/limits/limit-reached';
import { PublishMode } from '../../../shared/inventory/inventory-labels';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { InventoryStore } from '../data/inventory.store';
import { BinderFormDialogComponent, BinderFormDialogData } from './binder-form-dialog.component';

const SNACK_MS = 5000;

/** Wording of a successful publication. */
export function publishedMessage(binder: Pick<BinderResponse, 'name'>, mode: PublishMode): string {
  switch (mode) {
    case 'ONE_HOUR':
      return `“${binder.name}” is public for 1 hour.`;
    case 'ONE_DAY':
      return `“${binder.name}” is public for 24 hours.`;
    default:
      return `“${binder.name}” is public until you make it private.`;
  }
}

/**
 * Binder actions shared by the page and the binder manager: create/edit dialogs, publish,
 * unpublish, confirm and delete (with a confirmation), each with a snack bar outcome. Errors are
 * explained in the snack bar, except a reached plan limit (the global dialog explains it).
 */
@Injectable()
export class BinderActionsService {
  private readonly store = inject(InventoryStore);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly injector = inject(Injector);

  async create(): Promise<BinderResponse | undefined> {
    const binder = await this.openForm({});
    if (binder) {
      this.snackBar.open(`Binder “${binder.name}” created.`, 'OK', { duration: SNACK_MS });
    }
    return binder;
  }

  async edit(binder: BinderResponse): Promise<BinderResponse | undefined> {
    const saved = await this.openForm({ binder });
    if (saved) {
      this.snackBar.open('Binder saved.', 'OK', { duration: SNACK_MS });
    }
    return saved;
  }

  async publish(binder: BinderResponse, mode: PublishMode): Promise<boolean> {
    return this.run(
      () => this.store.publishBinder(binder.id, mode),
      publishedMessage(binder, mode),
    );
  }

  async unpublish(binder: BinderResponse): Promise<boolean> {
    return this.run(
      () => this.store.unpublishBinder(binder.id),
      `“${binder.name}” is private now.`,
    );
  }

  async confirm(binder: BinderResponse): Promise<boolean> {
    return this.run(
      () => this.store.confirmBinder(binder.id),
      `“${binder.name}” and its cards are confirmed as still available.`,
    );
  }

  /** Asks first; items become unfiled. Resolves `true` once deleted. */
  async remove(binder: BinderResponse): Promise<boolean> {
    const cards = `${binder.itemCount} ${binder.itemCount === 1 ? 'card' : 'cards'}`;
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: `Delete “${binder.name}”?`,
            message:
              binder.itemCount > 0
                ? `Its ${cards} stay in your inventory as unfiled cards (private unless the binder was public without an end date).`
                : 'The binder is empty.',
            confirmLabel: 'Delete binder',
            tone: 'danger',
          },
          panelClass: 'app-dialog--md',
          injector: this.injector,
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return false;
    }
    return this.run(() => this.store.deleteBinder(binder.id), `Binder “${binder.name}” deleted.`);
  }

  private openForm(data: BinderFormDialogData): Promise<BinderResponse | undefined> {
    return firstValueFrom(
      this.dialog
        .open<BinderFormDialogComponent, BinderFormDialogData, BinderResponse>(
          BinderFormDialogComponent,
          {
            data,
            panelClass: 'app-dialog--md',
            injector: this.injector,
            autoFocus: 'first-tabbable',
            restoreFocus: true,
          },
        )
        .afterClosed(),
    );
  }

  private async run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    try {
      await action();
      this.snackBar.open(success, 'OK', { duration: SNACK_MS });
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      if (!isLimitReached(apiError)) {
        this.snackBar.open(friendlyError(apiError).message, 'OK', { duration: 8000 });
      }
      return false;
    }
  }
}
