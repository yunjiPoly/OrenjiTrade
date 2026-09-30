import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ListingHealthService, ListingStatus } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';

/**
 * Listing health of the signed-in collector on `/inventory` (`GET /me/listings/status`):
 * a banner when their public listings are paused — with "Resume listings" for pauses of the
 * nightly unresponsiveness check (`POST /me/listings/resume`), or "under review" for moderation
 * pauses — and a gentle reminder while unanswered conversations count as strikes. Renders nothing
 * otherwise (or when the status cannot be read).
 */
@Component({
  selector: 'app-listings-paused-banner',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule],
  template: `
    @if (status(); as s) {
      @if (s.paused) {
        <aside class="banner banner--paused" aria-label="Listings paused" role="status">
          <span class="banner__icon" aria-hidden="true"><mat-icon>pause_circle</mat-icon></span>
          <div class="banner__text">
            <p class="banner__title">Your public listings are paused</p>
            @if (s.canResume) {
              <p>
                {{ waiting(s) }} are waiting for your answer, so collectors cannot see your public
                binders and cards for now. Reply to them, then confirm you are available again. Your
                inventory is unchanged.
              </p>
            } @else {
              <p>
                The moderation team is reviewing your account{{
                  s.pausedUntil ? ' until ' + (s.pausedUntil | date: 'mediumDate') : ''
                }}. Your public listings are hidden until the review is complete; your inventory is
                unchanged.
              </p>
            }
          </div>
          <div class="banner__actions">
            <a matButton="outlined" routerLink="/messages">
              <mat-icon aria-hidden="true">chat</mat-icon>
              Open messages
            </a>
            @if (s.canResume) {
              <button matButton="filled" type="button" [disabled]="resuming()" (click)="resume()">
                <mat-icon aria-hidden="true">play_circle</mat-icon>
                {{ resuming() ? 'Resuming…' : 'Resume listings' }}
              </button>
            }
          </div>
        </aside>
      } @else if (s.strikes > 0) {
        <aside class="banner" aria-label="Unanswered conversations">
          <span class="banner__icon" aria-hidden="true"><mat-icon>mark_chat_unread</mat-icon></span>
          <p class="banner__text">
            <strong>{{ waiting(s) }} waiting for your answer.</strong>
            Collectors expect a reply; after {{ s.maxStrikes }} unanswered conversations your public
            listings pause until you confirm you are available.
          </p>
          <a matButton="outlined" routerLink="/messages">Open messages</a>
        </aside>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-4);
      padding: var(--spacing-3) var(--spacing-4);
      border: 1px solid color-mix(in srgb, var(--color-warning) 45%, var(--color-border));
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--color-warning) 9%, var(--color-surface));
    }
    .banner--paused {
      border-color: color-mix(in srgb, var(--color-danger) 45%, var(--color-border));
      background: color-mix(in srgb, var(--color-danger) 7%, var(--color-surface));
    }
    .banner__icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--color-warning) 22%, var(--color-surface));
      color: var(--color-ink);
    }
    .banner__text {
      flex: 1 1 320px;
      margin: 0;
      font-size: var(--font-size-sm);
    }
    .banner__text p {
      margin: 0;
    }
    .banner__title {
      margin-bottom: 2px !important;
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
    }
    .banner__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingsPausedBannerComponent {
  private readonly api = inject(ListingHealthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** The listings are public again (the page reloads its view). */
  readonly resumed = output<void>();

  protected readonly status = signal<ListingStatus | null>(null);
  protected readonly resuming = signal(false);

  constructor() {
    this.api.getMyListingStatus('body', false, { context: silentErrors() }).subscribe({
      next: (status) => this.status.set(status),
      // Listing health is informative only: without an answer the page shows no banner.
      error: () => this.status.set(null),
    });
  }

  protected waiting(status: ListingStatus): string {
    const count = Math.max(status.strikes, status.unansweredConversations30d);
    return count === 1 ? '1 conversation' : `${count} conversations`;
  }

  protected async resume(): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: 'Show your listings again?',
            message:
              'Confirm that you are available to answer collectors. Your public binders and ' +
              'cards become visible on the map and in search again, and the unanswered ' +
              'conversation count starts over.',
            confirmLabel: 'Resume listings',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    this.resuming.set(true);
    try {
      this.status.set(
        await firstValueFrom(this.api.resumeMyListings('body', false, { context: silentErrors() })),
      );
      this.snackBar.open('Your public listings are visible again.', 'OK', { duration: 5000 });
      this.resumed.emit();
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 6000 });
    } finally {
      this.resuming.set(false);
    }
  }
}
