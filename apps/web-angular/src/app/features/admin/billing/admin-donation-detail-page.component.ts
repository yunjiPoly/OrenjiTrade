import { DatePipe, JsonPipe } from '@angular/common';
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
import { AdminBillingService, AdminDonationDetail } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { amountLabel } from '../../../shared/billing/billing-labels';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { confirmAdminAction, runAdminAction } from '../shared/admin-actions';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { statusText, statusTone } from './admin-billing-labels';

/**
 * `/admin/donations/:id` (ADMIN): one donation with its provider webhooks (payload on demand);
 * SUPER_ADMIN refunds a succeeded donation in full (audited `donation.refund`).
 */
@Component({
  selector: 'app-admin-donation-detail-page',
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
      <a class="billing-back" routerLink="/admin/donations">
        <mat-icon aria-hidden="true">arrow_back</mat-icon>
        Donations
      </a>
      @if (error(); as error) {
        <app-error-state
          [title]="
            error.status === 404 ? 'This donation does not exist' : 'The donation could not load'
          "
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="load()"
        />
      } @else if (detail(); as d) {
        @let donation = d.donation!;
        <div class="billing-sections">
          <section class="admin-card" aria-labelledby="donation-title">
            <div class="billing-head">
              <h1 id="donation-title">{{ money(donation.amount, donation.currency) }}</h1>
              <app-admin-chip [tone]="tone(donation.status)">{{
                text(donation.status)
              }}</app-admin-chip>
            </div>
            <dl class="billing-facts">
              <div>
                <dt>Created</dt>
                <dd>{{ donation.createdAt | date: 'medium' }}</dd>
              </div>
              <div>
                <dt>Succeeded</dt>
                <dd>{{ (donation.succeededAt | date: 'medium') ?? '—' }}</dd>
              </div>
              <div>
                <dt>Refunded</dt>
                <dd>{{ (donation.refundedAt | date: 'medium') ?? '—' }}</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>{{ donation.provider }}</dd>
              </div>
              <div>
                <dt>Public thanks</dt>
                <dd>{{ donation.publicThanks ? 'Yes' : 'No' }}</dd>
              </div>
              @if (donation.failureCode) {
                <div>
                  <dt>Failure</dt>
                  <dd>{{ donation.failureCode }}</dd>
                </div>
              }
              @if (donation.userId) {
                <div>
                  <dt>Donor</dt>
                  <dd><a [routerLink]="['/admin/users', donation.userId]">Open the account</a></dd>
                </div>
              }
            </dl>
            @if (donation.message) {
              <p class="message">“{{ donation.message }}”</p>
            }
            @if (donation.status === 'SUCCEEDED' && session.isSuperAdmin()) {
              <div class="billing-actions refund">
                <button
                  matButton="outlined"
                  type="button"
                  class="billing-danger"
                  [disabled]="busy()"
                  (click)="refund()"
                >
                  Refund in full
                </button>
              </div>
            }
          </section>

          <section class="admin-card" aria-labelledby="donation-webhooks">
            <h2 id="donation-webhooks">Provider webhooks</h2>
            @if ((d.webhooks ?? []).length === 0) {
              <p class="admin-muted">No webhook linked to this donation.</p>
            } @else {
              <ol class="billing-timeline">
                @for (hook of d.webhooks ?? []; track hook.id) {
                  <li>
                    <strong>{{ hook.type }}</strong>
                    <app-admin-chip [tone]="tone(hook.status)">{{
                      text(hook.status)
                    }}</app-admin-chip>
                    <span class="admin-muted">{{ hook.receivedAt | date: 'medium' }}</span>
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
          <span class="visually-hidden">Loading the donation</span>
          <app-skeleton height="160px" />
        </div>
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss', './admin-billing.scss'],
  styles: `
    h1 {
      margin: 0;
      font-size: var(--font-size-2xl);
    }
    .message {
      margin: var(--spacing-3) 0 0;
      font-style: italic;
    }
    .refund {
      margin-top: var(--spacing-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDonationDetailPageComponent {
  private readonly api = inject(AdminBillingService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly session = inject(SessionService);

  readonly id = input.required<string>();

  protected readonly detail = signal<AdminDonationDetail | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal(false);
  protected readonly openPayload = signal<string | null>(null);
  protected readonly text = statusText;
  protected readonly tone = statusTone;
  protected readonly money = amountLabel;

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
          this.api.getAdminDonation({ id: this.id() }, 'body', false, { context: silentErrors() }),
        ),
      );
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  protected togglePayload(id: string): void {
    this.openPayload.update((open) => (open === id ? null : id));
  }

  protected async refund(): Promise<void> {
    const donation = this.detail()?.donation;
    if (!donation) {
      return;
    }
    const confirmed = await confirmAdminAction(this.dialog, {
      title: 'Refund this donation?',
      message: `${amountLabel(donation.amount, donation.currency)} goes back to the donor through the provider. This cannot be undone.`,
      confirmLabel: 'Refund in full',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    this.busy.set(true);
    const saved = await runAdminAction(
      this.snackBar,
      this.api.refundAdminDonation({ id: this.id() }, 'body', false, { context: silentErrors() }),
      'The donation is refunded.',
      'Only succeeded donations can be refunded.',
    );
    this.busy.set(false);
    if (saved) {
      this.detail.set(saved);
    }
  }
}
