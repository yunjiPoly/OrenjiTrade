import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import type { ReportConfirmation } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import {
  ReportCollectorDialogComponent,
  ReportContextInput,
  ReportDialogData,
  ReportPostPreview,
  ReportTarget,
} from './report-collector-dialog.component';

/**
 * Opens the "Report collector" modal from any entry point (collector profile, conversation menu,
 * community post menu, public binder page). Resolves the confirmation when a
 * report was sent, `null` when the dialog was cancelled.
 */
@Injectable({ providedIn: 'root' })
export class ReportActionsService {
  private readonly dialog = inject(MatDialog);

  async report(
    target: ReportTarget,
    context: ReportContextInput,
    post?: ReportPostPreview,
  ): Promise<ReportConfirmation | null> {
    const result = await firstValueFrom(
      this.dialog
        .open<ReportCollectorDialogComponent, ReportDialogData, ReportConfirmation>(
          ReportCollectorDialogComponent,
          {
            data: post ? { target, context, post } : { target, context },
            panelClass: 'app-dialog--form',
            autoFocus: 'dialog',
          },
        )
        .afterClosed(),
    );
    return result ?? null;
  }
}
