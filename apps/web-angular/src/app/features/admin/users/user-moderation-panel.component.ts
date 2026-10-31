import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
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
import { AdminIconComponent } from '../console/admin-icon.component';
import { runConsoleAction } from '../console/console-actions';
import { ReportHistoryComponent } from '../reports/report-history.component';
import { ToastService } from '../../../core/feedback/toast.service';
import { askReason } from '../shared/admin-actions';

const SOURCE_LABELS: Record<string, string> = {
  UNRESPONSIVE: 'Unanswered conversations',
  REPORT_THRESHOLD: 'Several reports, pending review',
  MODERATION: 'Moderation decision',
  ADMIN: 'Administrator',
};

/**
 * The account page's Public listings and Moderation cards (board A8; `display: contents`, each
 * card placed by its grid area): the collector's listing status (paused or live, the reason,
 * strikes) with Pause / Resume listings (`POST /admin/users/{id}/pause-listings` /
 * `resume-listings`, confirmed, audited) and their moderation history
 * (`GET /admin/users/{id}/history`, never private messages).
 */
@Component({
  selector: 'app-user-moderation-panel',
  imports: [
    DatePipe,
    RouterLink,
    AdminIconComponent,
    ErrorStateComponent,
    ReportHistoryComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    @if (part() === 'listings') {
      <section class="cp-card pn" aria-labelledby="user-listings">
        <div class="pn__head">
          <h2 class="cp-card__title" id="user-listings">Public listings</h2>
          <a
            class="cp-link"
            routerLink="/admin/listings"
            [queryParams]="{ tab: 'all', ownerId: userId() }"
            >Their listings <app-admin-icon name="arrowRight" [size]="16"
          /></a>
        </div>
        @if (statusError(); as error) {
          <app-error-state
            compact
            title="The listing status could not load"
            [message]="message(error)"
            [requestId]="error.requestId"
            retryLabel="Try again"
            (retry)="load()"
          />
        } @else if (status(); as s) {
          <p class="pn__state" data-testid="listing-status" [class.pn__state--paused]="s.paused">
            <span class="pn__dot" aria-hidden="true"></span>
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
            <p class="pn__line">Reason: “{{ s.reason }}”</p>
          }
          <p class="pn__line">
            {{ s.strikes }} of {{ s.maxStrikes }} strikes · {{ s.unansweredConversations30d }}
            unanswered conversations (30 days)
            @if (s.evaluatedAt) {
              · checked {{ s.evaluatedAt | relativeTime }}
            }
          </p>
          <div class="pn__actions">
            @if (s.paused) {
              <button
                type="button"
                class="cb cb--outline"
                [attr.aria-disabled]="busy() ? 'true' : null"
                (click)="busy() || resume()"
              >
                <app-admin-icon name="restore" [size]="18" />
                Resume listings
              </button>
            } @else {
              <button
                type="button"
                class="cb cb--danger-outline"
                [attr.aria-disabled]="busy() ? 'true' : null"
                (click)="busy() || pause()"
              >
                <app-admin-icon name="pause" [size]="18" />
                Pause listings
              </button>
            }
          </div>
        } @else {
          <app-skeleton variant="list" lines="2" />
        }
      </section>
    } @else {
      <section class="cp-card pn" aria-labelledby="user-history">
        <div class="pn__head">
          <h2 class="cp-card__title" id="user-history">Moderation</h2>
          <a
            class="cp-link"
            routerLink="/admin/reports"
            [queryParams]="{ reportedUserId: userId() }"
            >All reports about them <app-admin-icon name="arrowRight" [size]="16"
          /></a>
        </div>
        @if (historyError(); as error) {
          <app-error-state
            compact
            title="The history could not load"
            [message]="message(error)"
            [requestId]="error.requestId"
            retryLabel="Try again"
            (retry)="load()"
          />
        } @else if (history(); as h) {
          <dl class="pn__facts">
            <div [class.pn__fact--warn]="h.openReports > 0">
              <dt>Open reports</dt>
              <dd>{{ h.openReports }}</dd>
            </div>
            <div [class.pn__fact--warn]="(status()?.strikes ?? 0) > 0">
              <dt>Strikes</dt>
              <dd>
                @if (status(); as s) {
                  {{ s.strikes }} of {{ s.maxStrikes }}
                } @else {
                  —
                }
              </dd>
            </div>
            <div [class.pn__fact--warn]="h.openFlags.length > 0">
              <dt>Open flags</dt>
              <dd>{{ h.openFlags.length }}</dd>
            </div>
            <div [class.pn__fact--ok]="status() && !status()?.paused">
              <dt>Listings</dt>
              <dd>{{ status() ? (status()?.paused ? 'Paused' : 'Live') : '—' }}</dd>
            </div>
          </dl>
          <app-report-history [history]="h" [accountView]="true" />
        } @else {
          <app-skeleton variant="list" lines="4" />
        }
      </section>
    }
  `,
  styleUrls: ['../console/console-page.scss', '../console/console-controls.scss'],
  styles: `
    :host {
      display: block;
    }
    .pn {
      padding: 20px 24px 22px;
    }
    .pn__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 14px;
    }
    .pn__state {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 4px;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .pn__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-success);
    }
    .pn__state--paused .pn__dot {
      background: var(--color-danger);
    }
    .pn__line {
      margin: 0 0 4px;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .pn__actions {
      margin-top: 14px;
    }
    .pn__facts {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin: 0 0 16px;
    }
    .pn__facts div {
      padding: 12px 14px;
      border: 1px solid var(--color-border);
      border-radius: 12px;
      background: var(--color-background);
    }
    .pn__facts dt {
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }
    .pn__facts dd {
      margin: 4px 0 0;
      color: var(--color-ink);
      font-family: var(--font-display);
      font-size: 20px;
      font-weight: var(--font-weight-bold);
    }
    .pn__fact--warn dd {
      color: var(--app-warning-text);
    }
    .pn__fact--ok dd {
      color: var(--app-success-text);
    }
    @media (max-width: 599.98px) {
      .pn__facts {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserModerationPanelComponent {
  private readonly delistingApi = inject(AdminDelistingService);
  private readonly reportsApi = inject(AdminReportsService);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);

  readonly userId = input.required<string>();
  readonly handle = input.required<string>();
  /** Board A8 places the two cards in different columns: one instance per card. */
  readonly part = input<'listings' | 'moderation'>('listings');
  /** After a pause or a resume (the other card reloads its facts). */
  readonly changed = output<void>();

  readonly status = signal<ListingStatus | null>(null);
  protected readonly statusError = signal<ApiError | null>(null);
  protected readonly history = signal<ModerationHistory | null>(null);
  protected readonly historyError = signal<ApiError | null>(null);
  readonly busy = signal(false);

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

  async load(): Promise<void> {
    const id = this.userId();
    const options = { context: silentErrors() };
    this.statusError.set(null);
    this.historyError.set(null);
    await Promise.all([
      firstValueFrom(this.delistingApi.getUserListingStatus({ id }, 'body', false, options))
        .then((status) => this.status.set(status))
        .catch((error: unknown) => this.statusError.set(toApiError(error))),
      this.part() === 'moderation'
        ? firstValueFrom(this.reportsApi.getUserModerationHistory({ id }, 'body', false, options))
            .then((history) => this.history.set(history))
            .catch((error: unknown) => this.historyError.set(toApiError(error)))
        : Promise.resolve(),
    ]);
  }

  async pause(): Promise<void> {
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

  async resume(): Promise<void> {
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
    const status = await runConsoleAction(this.toasts, request, success, conflict);
    this.busy.set(false);
    if (status) {
      this.status.set(status);
    }
    await this.load();
    if (status) {
      this.changed.emit();
    }
  }
}
