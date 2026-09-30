import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import type { ReportConfirmation } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import {
  ReportCollectorDialogComponent,
  ReportContextInput,
  ReportDialogData,
  ReportTarget,
} from './report-collector-dialog.component';

/**
 * Opens the "Report collector" modal from any entry point (collector profile, map preview,
 * conversation menu, community post menu, public binder page). Resolves the confirmation when a
 * report was sent, `null` when the dialog was cancelled.
 */
@Injectable({ providedIn: 'root' })
export class ReportActionsService {
  private readonly dialog = inject(MatDialog);

  async report(
    target: ReportTarget,
    context: ReportContextInput,
  ): Promise<ReportConfirmation | null> {
    const result = await firstValueFrom(
      this.dialog
        .open<ReportCollectorDialogComponent, ReportDialogData, ReportConfirmation>(
          ReportCollectorDialogComponent,
          {
            data: { target, context },
            panelClass: 'app-dialog--md',
            autoFocus: 'dialog',
          },
        )
        .afterClosed(),
    );
    return result ?? null;
  }
}
