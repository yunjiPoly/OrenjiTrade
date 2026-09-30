import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import {
  ReasonDialogComponent,
  ReasonDialogData,
  ReasonDialogResult,
} from './reason-dialog.component';

/** Suffix of every admin confirmation: the API records each write in the audit log. */
export const AUDITED = 'The action is in the audit log.';

/**
 * Runs an audited admin write: resolves the answer and shows `success` in a snack bar, or shows
 * a friendly error (409 conflicts use `conflict` when given) and resolves `null`.
 */
export async function runAdminAction<T>(
  snackBar: MatSnackBar,
  request: Observable<T>,
  success: string,
  conflict?: string,
): Promise<T | null> {
  try {
    const result = await firstValueFrom(request);
    snackBar.open(`${success} ${AUDITED}`, 'OK', { duration: 5000 });
    return result;
  } catch (error) {
    const apiError: ApiError = toApiError(error);
    snackBar.open(
      apiError.status === 409 && conflict ? conflict : friendlyMessage(apiError),
      'OK',
      { duration: 7000 },
    );
    return null;
  }
}

/** Opens the generic confirmation dialog; resolves `true` when confirmed. */
export async function confirmAdminAction(
  dialog: MatDialog,
  data: ConfirmDialogData,
): Promise<boolean> {
  return (
    (await firstValueFrom(
      dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data,
        })
        .afterClosed(),
    )) === true
  );
}

/** Opens the reason dialog; resolves the reason (and optional end) or `null` when cancelled. */
export async function askReason(
  dialog: MatDialog,
  data: ReasonDialogData,
): Promise<ReasonDialogResult | null> {
  return (
    (await firstValueFrom(
      dialog
        .open<ReasonDialogComponent, ReasonDialogData, ReasonDialogResult>(ReasonDialogComponent, {
          data,
          panelClass: 'app-dialog--md',
        })
        .afterClosed(),
    )) ?? null
  );
}
