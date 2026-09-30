import { DatePipe, JsonPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { AdminBillingService, AdminSubscriptionDetail } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { amountLabel, isEntitling } from '../../../shared/billing/billing-labels';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { askReason, runAdminAction } from '../shared/admin-actions';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { statusText, statusTone } from './admin-billing-labels';

/**
 * `/admin/subscriptions/:id` (ADMIN): one subscription with its history (`subscription_event`)
 * and the provider webhooks (payload on demand). Cancel at the period end or at once, with a
 * reason for the audit log (`subscription.cancel`).
 */
@Component({
  selector: 'app-admin-subscription-detail-page',
  imports: [
    DatePipe,
    JsonPipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    AdminChipComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <a class="billing-back" routerLink="/admin/subscriptions">
        <mat-icon aria-hidden="true">arrow_back</mat-icon>
        Subscriptions
      </a>
      @if (error(); as error) {
        <app-error-state
          [title]="
            error.status === 404
              ? 'This subscription does not exist'
              : 'The subscription could not load'
          "
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="load()"
        />
      } @else if (detail(); as d) {
        @let s = d.subscription!;
        <div class="billing-sections">
          <section class="admin-card" aria-labelledby="sub-title">
            <div class="billing-head">
              <h1 id="sub-title">&#64;{{ s.userHandle ?? 'deleted' }} · {{ s.planCode }}</h1>
              <app-admin-chip [tone]="tone(s.status)" data-testid="admin-subscription-status">{{
                text(s.status)
              }}</app-admin-chip>
            </div>
            <dl class="billing-facts">
              <div>
                <dt>Price</dt>
                <dd>{{ money(s.amount, s.currency) }} / month</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>{{ s.provider }}</dd>
              </div>
              <div>
                <dt>Current period</dt>
                <dd>
                  {{ s.currentPeriodStart | date: 'mediumDate' }} –
                  {{ s.currentPeriodEnd | date: 'mediumDate' }}
                </dd>
              </div>
              <div>
                <dt>Cancel at period end</dt>
                <dd>{{ s.cancelAtPeriodEnd ? 'Yes' : 'No' }}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{{ s.createdAt | date: 'medium' }}</dd>
              </div>
              <div>
                <dt>Activated</dt>
                <dd>{{ (s.activatedAt | date: 'medium') ?? '—' }}</dd>
              </div>
              <div>
                <dt>Ended</dt>
                <dd>{{ (s.endedAt | date: 'medium') ?? '—' }}</dd>
              </div>
              @if (s.failureCode) {
                <div>
                  <dt>Last failure</dt>
                  <dd>{{ s.failureCode }}</dd>
                </div>
              }
              <div>
                <dt>Account</dt>
                <dd>
                  <a [routerLink]="['/admin/users', s.userId]">Open the account</a> ·
                  <a routerLink="/admin/audit-logs" [queryParams]="{ targetId: s.id }">Audit log</a>
                </dd>
              </div>
            </dl>
            @if (live()) {
              <div class="billing-actions detail-actions">
                @if (!s.cancelAtPeriodEnd && s.status !== 'PENDING') {
                  <button
                    matButton="outlined"
                    type="button"
                    [disabled]="busy()"
                    (click)="cancel(false)"
                  >
                    Cancel at period end
                  </button>
                }
                <button
                  matButton="outlined"
                  type="button"
                  class="billing-danger"
                  [disabled]="busy()"
                  (click)="cancel(true)"
                >
                  Cancel now
                </button>
              </div>
            }
          </section>

          <section class="admin-card" aria-labelledby="sub-history">
            <h2 id="sub-history">History</h2>
            @if ((d.events ?? []).length === 0) {
              <p class="admin-muted">No events yet.</p>
            } @else {
              <ol class="billing-timeline">
                @for (event of d.events ?? []; track event.id) {
                  <li>
                    <strong>{{ event.event }}</strong>
                    <span class="admin-muted">{{ event.createdAt | date: 'medium' }}</span>
                    @if (event.actorId) {
                      <span class="admin-muted">{{
                        event.actorId === s.userId ? 'by the member' : 'by an admin'
                      }}</span>
                    }
                  </li>
                }
              </ol>
            }
          </section>

          <section class="admin-card" aria-labelledby="sub-webhooks">
            <h2 id="sub-webhooks">Provider webhooks</h2>
            @if ((d.webhooks ?? []).length === 0) {
              <p class="admin-muted">No webhook linked to this subscription.</p>
            } @else {
              <ol class="billing-timeline">
                @for (hook of d.webhooks ?? []; track hook.id) {
                  <li>
                    <strong>{{ hook.type }}</strong>
                    <app-admin-chip [tone]="tone(hook.status)">{{
                      text(hook.status)
                    }}</app-admin-chip>
                    <span class="admin-muted">{{ hook.receivedAt | date: 'medium' }}</span>
                    @if (hook.error) {
                      <span class="admin-muted">{{ hook.error }}</span>
                    }
                    <button
                      matButton
                      type="button"
                      [attr.aria-expanded]="openPayload() === hook.id"
                      (click)="togglePayload(hook.id ?? '')"
                    >
                      {{ openPayload() === hook.id ? 'Hide payload' : 'Show payload' }}
                    </button>
                    @if (openPayload() === hook.id) {
                      <pre class="billing-payload">{{ hook.payload | json }}</pre>
                    }
                  </li>
                }
              </ol>
            }
          </section>
        </div>
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading the subscription</span>
          <app-skeleton height="180px" />
          <app-skeleton variant="list" lines="4" />
        </div>
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss', './admin-billing.scss'],
  styles: `
    h1 {
      margin: 0;
      font-size: var(--font-size-xl);
    }
    .detail-actions {
      margin-top: var(--spacing-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSubscriptionDetailPageComponent {
  private readonly api = inject(AdminBillingService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly id = input.required<string>();

  protected readonly detail = signal<AdminSubscriptionDetail | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal(false);
  protected readonly openPayload = signal<string | null>(null);
  protected readonly text = statusText;
  protected readonly tone = statusTone;
  protected readonly money = amountLabel;
  protected readonly live = computed(() => {
    const status = this.detail()?.subscription?.status;
    return status === 'PENDING' || isEntitling(status);
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.load());
    });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.detail.set(
        await firstValueFrom(
          this.api.getAdminSubscription({ id: this.id() }, 'body', false, {
            context: silentErrors(),
          }),
        ),
      );
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  protected togglePayload(id: string): void {
    this.openPayload.update((open) => (open === id ? null : id));
  }

  protected async cancel(immediately: boolean): Promise<void> {
    const answer = await askReason(this.dialog, {
      title: immediately ? 'Cancel this subscription now?' : 'Cancel at the end of the period?',
      message: immediately
        ? 'The member goes back to the free plan at once and their Premium limits end now.'
        : 'Premium stays until the end of the paid period, then the member is on the free plan.',
      confirmLabel: immediately ? 'Cancel now' : 'Cancel at period end',
      label: 'Reason',
      hint: 'Kept in the audit log (not stored on the subscription).',
      maxLength: 500,
      tone: immediately ? 'danger' : 'default',
    });
    if (!answer) {
      return;
    }
    this.busy.set(true);
    const result = await runAdminAction(
      this.snackBar,
      this.api.cancelAdminSubscription(
        {
          id: this.id(),
          adminSubscriptionCancelRequest: { immediately, reason: answer.reason },
        },
        'body',
        false,
        { context: silentErrors() },
      ),
      immediately ? 'The subscription is cancelled.' : 'The subscription ends at the period end.',
      'This subscription already ended.',
    );
    this.busy.set(false);
    if (result) {
      this.detail.set(result);
    } else {
      void this.load();
    }
  }
}
