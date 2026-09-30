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

/**
 * Block and unblock with a confirmation and a snack bar (`POST/DELETE /users/{id}/block`). Both
 * calls are idempotent on the server. Resolves `true` when the change was made.
 */
@Injectable({ providedIn: 'root' })
export class BlockActionsService {
  private readonly api = inject(BlocksService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  async block(target: BlockTarget): Promise<boolean> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: `Block ${target.displayName}?`,
            message:
              'You will stop seeing each other on the map, in search and in the community, and ' +
              'neither of you can send messages. They are not told. You can unblock them from ' +
              'Settings → Blocked users.',
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
      this.snackBar.open(`${target.displayName} is blocked.`, 'OK', { duration: 5000 });
      return true;
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 6000 });
      return false;
    }
  }

  async unblock(target: BlockTarget): Promise<boolean> {
    try {
      await firstValueFrom(
        this.api.unblockUser({ id: target.id }, 'body', false, { context: silentErrors() }),
      );
      this.snackBar.open(`${target.displayName} is unblocked.`, 'OK', { duration: 5000 });
      return true;
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 6000 });
      return false;
    }
  }
}
