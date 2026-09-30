import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  RatingEligibility,
  RatingEligibilityInteraction,
  RatingResponse,
  RatingsService,
  ReferenceResponse,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { silentErrors } from '../../core/http/http-context';
import {
  RateCollectorDialogComponent,
  RateDialogData,
  RatedCollector,
} from './rate-collector-dialog.component';
import {
  ReferenceDialogData,
  WriteReferenceDialogComponent,
} from './write-reference-dialog.component';

/**
 * Rating and reference dialogs shared by the collector profile and the conversation menu, with a
 * snack-bar confirmation. Every method resolves `null` when the dialog was cancelled.
 */
@Injectable({ providedIn: 'root' })
export class RatingActionsService {
  private readonly api = inject(RatingsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** `GET /ratings/eligibility?userId=` (errors propagate as HTTP errors). */
  eligibility(userId: string): Promise<RatingEligibility> {
    return firstValueFrom(
      this.api.getRatingEligibility({ userId }, 'body', false, { context: silentErrors() }),
    );
  }

  /** Rates one of the given (still unrated) interactions. */
  rate(
    collector: RatedCollector,
    interactions: readonly RatingEligibilityInteraction[],
  ): Promise<RatingResponse | null> {
    return this.openRating(
      { collector, interactions },
      `Thanks! Your rating of ${collector.displayName} is published.`,
    );
  }

  /** Edits the caller's own rating (within its 14-day window). */
  edit(collector: RatedCollector, rating: RatingResponse): Promise<RatingResponse | null> {
    return this.openRating({ collector, rating }, 'Your rating is updated.');
  }

  async writeReference(collector: RatedCollector): Promise<ReferenceResponse | null> {
    const reference = await firstValueFrom(
      this.dialog
        .open<WriteReferenceDialogComponent, ReferenceDialogData, ReferenceResponse>(
          WriteReferenceDialogComponent,
          { data: { collector }, panelClass: 'app-dialog--md' },
        )
        .afterClosed(),
    );
    if (reference) {
      this.snackBar.open(`Your reference for ${collector.displayName} is published.`, 'OK', {
        duration: 5000,
      });
    }
    return reference ?? null;
  }

  private async openRating(
    data: RateDialogData,
    confirmation: string,
  ): Promise<RatingResponse | null> {
    const rating = await firstValueFrom(
      this.dialog
        .open<RateCollectorDialogComponent, RateDialogData, RatingResponse>(
          RateCollectorDialogComponent,
          { data, panelClass: 'app-dialog--md', autoFocus: 'dialog' },
        )
        .afterClosed(),
    );
    if (rating) {
      this.snackBar.open(confirmation, 'OK', { duration: 5000 });
    }
    return rating ?? null;
  }
}
