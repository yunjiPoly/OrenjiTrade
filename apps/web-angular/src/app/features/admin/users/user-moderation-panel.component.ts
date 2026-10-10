import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import {
  AdminDelistingService,
  AdminReportsService,
  ListingStatus,
  ModerationHistory,
} from '@orenji/api-client';
import { Observable, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { ModerationHistoryComponent } from '../reports/moderation-history.component';
import { askReason, runAdminAction } from '../shared/admin-actions';

const SOURCE_LABELS: Record<string, string> = {
  UNRESPONSIVE: 'Unanswered conversations',
  REPORT_THRESHOLD: 'Several reports, pending review',
  MODERATION: 'Moderation decision',
  ADMIN: 'Administrator',
};

/**
 * Moderation panel of the admin user page: the collector's listing status (paused or live, the
 * reason, strikes) with Pause / Resume listings (`POST /admin/users/{id}/pause-listings` /
 * `resume-listings`, confirmed, audited) and their moderation history
 * (`GET /admin/users/{id}/history`, never private messages).
 */
@Component({
  selector: 'app-user-moderation-panel',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    ErrorStateComponent,
    ModerationHistoryComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    <section class="admin-card" aria-labelledby="user-listings">
      <div class="panel__head">
        <h2 id="user-listings">Public listings</h2>
        <a
          matButton
          routerLink="/admin/listings"
          [queryParams]="{ tab: 'all', ownerId: userId() }"
          class="panel__link"
        >
          Their listings
        </a>
        @if (status(); as s) {
          @if (s.paused) {
            <button matButton="filled" type="button" [disabled]="busy()" (click)="resume()">
              <mat-icon aria-hidden="true">play_circle</mat-icon>
              Resume listings
            </button>
          } @else {
            <button
              matButton="outlined"
              type="button"
              class="panel__danger"
              [disabled]="busy()"
              (click)="pause()"
            >
              <mat-icon aria-hidden="true">pause_circle</mat-icon>
              Pause listings
            </button>
          }
        }
      </div>
      @if (statusError(); as error) {
        <app-error-state
          compact
          title="The listing status could not load"
          [message]="message(error)"
          (retry)="load()"
        />
      } @else if (status(); as s) {
        <p
          class="panel__state"
          data-testid="listing-status"
          [class.panel__state--paused]="s.paused"
        >
          <mat-icon aria-hidden="true">{{ s.paused ? 'pause_circle' : 'check_circle' }}</mat-icon>
          @if (s.paused) {
            Paused
            @if (s.source) {
              — {{ source(s.source) }}
            }
            @if (s.pausedAt) {
              · {{ s.pausedAt | relativeTime }}
            }
            @if (s.pausedUntil) {
              · until {{ s.pausedUntil | date: 'medium' }}
            }
          } @else {
            Live — public binders and cards are visible
          }
        </p>
        @if (s.paused && s.reason) {
          <p class="admin-muted">Reason: “{{ s.reason }}”</p>
        }
        <p class="admin-muted">
          {{ s.strikes }} of {{ s.maxStrikes }} strikes · {{ s.unansweredConversations30d }}
          unanswered conversations (30 days)
          @if (s.evaluatedAt) {
            · checked {{ s.evaluatedAt | relativeTime }}
          }
        </p>
      } @else {
        <app-skeleton variant="list" lines="2" />
      }
    </section>

    <section class="admin-card" aria-labelledby="user-history">
      <div class="panel__head">
        <h2 id="user-history">Moderation history</h2>
        <a matButton routerLink="/admin/reports" [queryParams]="{ reportedUserId: userId() }">
          Reports about them
        </a>
      </div>
      @if (historyError(); as error) {
        <app-error-state
          compact
          title="The history could not load"
          [message]="message(error)"
          (retry)="load()"
        />
      } @else if (history(); as h) {
        <app-moderation-history [history]="h" />
      } @else {
        <app-skeleton variant="list" lines="4" />
      }
    </section>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    :host {
      display: contents;
    }
    .panel__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
      margin-bottom: var(--spacing-2);
    }
    .panel__head h2 {
      margin: 0;
    }
    .panel__link {
      margin-left: auto;
    }
    .panel__state {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0 0 var(--spacing-1);
      font-weight: var(--font-weight-semibold);
    }
    .panel__state mat-icon {
      color: var(--color-success);
    }
    .panel__state--paused mat-icon {
      color: var(--color-danger);
    }
    .panel__danger {
      --mat-button-outlined-label-text-color: var(--color-danger);
      --mat-button-outlined-outline-color: var(--color-danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserModerationPanelComponent {
  private readonly delistingApi = inject(AdminDelistingService);
  private readonly reportsApi = inject(AdminReportsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly userId = input.required<string>();
  readonly handle = input.required<string>();

  protected readonly status = signal<ListingStatus | null>(null);
  protected readonly statusError = signal<ApiError | null>(null);
  protected readonly history = signal<ModerationHistory | null>(null);
  protected readonly historyError = signal<ApiError | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      this.userId();
      untracked(() => void this.load());
    });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected source(value: string): string {
    return SOURCE_LABELS[value] ?? value;
  }

  protected async load(): Promise<void> {
    const id = this.userId();
    const options = { context: silentErrors() };
    this.statusError.set(null);
    this.historyError.set(null);
    await Promise.all([
      firstValueFrom(this.delistingApi.getUserListingStatus({ id }, 'body', false, options))
        .then((status) => this.status.set(status))
        .catch((error: unknown) => this.statusError.set(toApiError(error))),
      firstValueFrom(this.reportsApi.getUserModerationHistory({ id }, 'body', false, options))
        .then((history) => this.history.set(history))
        .catch((error: unknown) => this.historyError.set(toApiError(error))),
    ]);
  }

  protected async pause(): Promise<void> {
    const answer = await askReason(this.dialog, {
      title: `Pause the listings of @${this.handle()}?`,
      message:
        'Their public binders and cards disappear from the map, search and wishlist alerts until you ' +
        'resume them or the end date passes. Their inventory is unchanged; they get a notice ' +
        'without your reason.',
      confirmLabel: 'Pause listings',
      withUntil: true,
      untilLabel: 'Paused until (optional)',
      tone: 'danger',
    });
    if (!answer) {
      return;
    }
    await this.act(
      this.delistingApi.pauseUserListings(
        {
          id: this.userId(),
          pauseListingsRequest: { reason: answer.reason, until: answer.until },
        },
        'body',
        false,
        { context: silentErrors() },
      ),
      `The listings of @${this.handle()} are paused.`,
      'Their listings are already paused.',
    );
  }

  protected async resume(): Promise<void> {
    const answer = await askReason(this.dialog, {
      title: `Resume the listings of @${this.handle()}?`,
      message: 'Their public binders and cards become visible again right away.',
      confirmLabel: 'Resume listings',
      required: false,
      label: 'Note (optional)',
    });
    if (!answer) {
      return;
    }
    await this.act(
      this.delistingApi.resumeUserListings(
        {
          id: this.userId(),
          resumeListingsRequest: answer.reason ? { note: answer.reason } : {},
        },
        'body',
        false,
        { context: silentErrors() },
      ),
      `The listings of @${this.handle()} are live again.`,
      'Their listings are not paused.',
    );
  }

  private async act(
    request: Observable<ListingStatus>,
    success: string,
    conflict: string,
  ): Promise<void> {
    this.busy.set(true);
    const status = await runAdminAction(this.snackBar, request, success, conflict);
    this.busy.set(false);
    if (status) {
      this.status.set(status);
    }
    await this.load();
  }
}
