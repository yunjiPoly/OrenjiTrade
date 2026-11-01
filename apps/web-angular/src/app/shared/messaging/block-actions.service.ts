import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BlocksService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { silentErrors } from '../../core/http/http-context';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../ui/confirm-dialog/confirm-dialog.component';

/** The collector a block or unblock acts on. */
export interface BlockTarget {
  id: string;
  displayName: string;
}

/** A block asked from somewhere with its own words (a community room, board W22). */
export interface BlockOptions {
  /** The confirmation's title and text instead of the default ones. */
  title?: string;
  message?: string;
  /** `false`: the caller says it is done itself (a toast with Undo); refusals still show. */
  notify?: boolean;
}

/**
 * Block and unblock with a confirmation and a snack bar (`POST/DELETE /users/{id}/block`). Both
 * calls are idempotent on the server. Resolves `true` when the change was made.
 */
@Injectable({ providedIn: 'root' })
export class BlockActionsService {
  private readonly api = inject(BlocksService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  async block(target: BlockTarget, options: BlockOptions = {}): Promise<boolean> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: options.title ?? `Block ${target.displayName}?`,
            message:
              options.message ??
              'You will stop seeing each other’s binders, profiles and posts on the map, in search ' +
                'and in the community, and neither of you can send messages. They are not told. ' +
                'You can unblock them from Settings → Blocked users.',
            confirmLabel: 'Block',
            tone: 'danger',
          },
          autoFocus: 'dialog',
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return false;
    }
    try {
      await firstValueFrom(
        this.api.blockUser({ id: target.id, blockUserRequest: {} }, 'body', false, {
          context: silentErrors(),
        }),
      );
      if (options.notify !== false) {
        this.snackBar.open(`${target.displayName} is blocked.`, 'OK', { duration: 5000 });
      }
      return true;
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 6000 });
      return false;
    }
  }

  async unblock(target: BlockTarget, options: Pick<BlockOptions, 'notify'> = {}): Promise<boolean> {
    try {
      await firstValueFrom(
        this.api.unblockUser({ id: target.id }, 'body', false, { context: silentErrors() }),
      );
      if (options.notify !== false) {
        this.snackBar.open(`${target.displayName} is unblocked.`, 'OK', { duration: 5000 });
      }
      return true;
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 6000 });
      return false;
    }
  }
}
