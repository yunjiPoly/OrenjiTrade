import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { safeReturnUrl } from '../../../core/auth/auth.guards';
import { toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { safeAppPath } from '../../../core/notifications/notification-kinds';
import { StatusChipComponent } from '../../../shared/offers/status-chip.component';
import { providerLabel, sellerAccountInfo } from '../../../shared/payments/payment-labels';
import { ProtectionExplainerComponent } from '../../../shared/payments/protection-explainer.component';
import { SellerAccountService } from '../../../shared/payments/seller-account.service';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

const RETURN_PATH = '/settings/payouts';

/** Wording of each payout-account status (what it means and what to do). */
const STATUS_TEXT: Record<string, { lead: string; action: string | null }> = {
  NOT_STARTED: {
    lead: 'Set up payouts to sell with payment protection. The payment provider checks your identity and bank details; OrenjiTrade never sees them.',
    action: 'Set up payouts',
  },
  PENDING: {
    lead: 'The payment provider is checking your details. Buyers can pay you once it is done.',
    action: 'Continue the setup',
  },
  ACTIVE: {
    lead: 'Your payouts are ready: buyers can pay you with payment protection, and each payout reaches you once the buyer confirms receipt.',
    action: null,
  },
  RESTRICTED: {
    lead: 'The payment provider needs more information before it can pay you out.',
    action: 'Update your details',
  },
};

/**
 * Settings → Payouts (`GET /me/seller-account`, `POST /me/seller-account/onboarding`): the seller
 * onboarding card of payment protection. "Set up payouts" continues on the provider's hosted
 * onboarding (the local fake provider activates the account at once and comes back with
 * `?onboarding=complete`). `?returnTo=/trades/<id>` offers the way back to the trade that asked
 * for it. Hidden while the `protectedPayments` flag is off.
 */
@Component({
  selector: 'app-payout-settings',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    ErrorStateComponent,
    ProtectionExplainerComponent,
    SectionCardComponent,
    SkeletonComponent,
    StatusChipComponent,
  ],
  template: `
    <app-section-card
      heading="Payouts"
      headingId="payout-settings-heading"
      description="Where the money of your protected sales goes."
    >
      @switch (accounts.status()) {
        @case ('disabled') {
          <p class="po__off" role="note">
            <mat-icon aria-hidden="true">info</mat-icon>
            Payment protection is not available right now, so there is nothing to set up.
          </p>
        }
        @case ('error') {
          <app-error-state
            compact
            title="Your payout account could not load"
            [message]="errorMessage()"
            (retry)="load()"
          />
        }
        @case ('ready') {
          @if (accounts.account(); as account) {
            @if (completed() && accounts.ready()) {
              <div class="po__done" role="status" data-testid="payouts-complete">
                <mat-icon aria-hidden="true">celebration</mat-icon>
                <span>Payouts are set up. Buyers can now pay you with payment protection.</span>
                @if (returnPath(); as back) {
                  <a matButton="filled" [routerLink]="back">Back to your trade</a>
                }
              </div>
            }
            <div class="po__status" data-testid="payout-status">
              <app-status-chip [label]="info().label" [icon]="info().icon" [tone]="info().tone" />
              <p class="po__lead">{{ text().lead }}</p>
            </div>
            <dl class="po__facts">
              <div>
                <dt>Payment provider</dt>
                <dd>{{ provider() }}</dd>
              </div>
              <div>
                <dt>Payouts</dt>
                <dd>{{ account.payoutsEnabled ? 'Enabled' : 'Not enabled yet' }}</dd>
              </div>
              @if (account.updatedAt) {
                <div>
                  <dt>Last update</dt>
                  <dd>{{ account.updatedAt | date: 'MMM d, y' }}</dd>
                </div>
              }
            </dl>
            @if (account.provider === 'fake') {
              <p class="po__local" role="note">
                <mat-icon aria-hidden="true">science</mat-icon>
                Local test provider: the setup completes at once and no real money ever moves.
              </p>
            }
            @if (problem(); as message) {
              <p class="section-error" role="alert">{{ message }}</p>
            }
            @if (text().action; as action) {
              <div class="section-actions">
                <button matButton="filled" type="button" [disabled]="starting()" (click)="start()">
                  <mat-icon aria-hidden="true">account_balance</mat-icon>
                  {{ starting() ? 'Opening…' : action }}
                </button>
              </div>
            }
          }
        }
        @default {
          <div aria-busy="true">
            <span class="visually-hidden">Loading your payout account</span>
            <app-skeleton variant="list" lines="3" />
          </div>
        }
      }
    </app-section-card>
    @if (accounts.status() === 'ready') {
      <app-protection-explainer />
    }
  `,
  styleUrls: ['../settings-section.scss'],
  styles: `
    .po__status {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-2);
    }
    .po__lead {
      margin: 0;
    }
    .po__facts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: var(--spacing-3);
      margin: var(--spacing-4) 0 0;
    }
    .po__facts dt {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .po__facts dd {
      margin: 2px 0 0;
      font-weight: var(--font-weight-medium);
    }
    .po__done,
    .po__local,
    .po__off {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2) var(--spacing-3);
      margin: 0 0 var(--spacing-4);
      padding: var(--spacing-3) var(--spacing-4);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
    }
    .po__done {
      background: color-mix(in srgb, var(--color-success) 14%, var(--color-surface));
    }
    .po__done > span {
      flex: 1 1 240px;
    }
    .po__local {
      margin: var(--spacing-4) 0 0;
      border: 1px dashed var(--color-warning);
      background: color-mix(in srgb, var(--color-warning) 10%, var(--color-surface));
    }
    .po__off {
      background: var(--color-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayoutSettingsComponent {
  protected readonly accounts = inject(SellerAccountService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  /** `?onboarding=complete` (back from the provider) and `?returnTo=` (bound by the router). */
  readonly onboarding = input<string | undefined>();
  readonly returnTo = input<string | undefined>();

  protected readonly starting = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly completed = computed(() => this.onboarding() === 'complete');
  protected readonly returnPath = computed(() => {
    const target = safeAppPath(this.returnTo());
    return target && target.startsWith('/trades/') ? safeReturnUrl(target) : null;
  });
  protected readonly info = computed(() => sellerAccountInfo(this.accounts.account()?.status));
  protected readonly text = computed(
    () =>
      STATUS_TEXT[this.accounts.account()?.status ?? 'NOT_STARTED'] ?? STATUS_TEXT['NOT_STARTED'],
  );
  protected readonly provider = computed(() => providerLabel(this.accounts.account()?.provider));
  protected readonly errorMessage = computed(() => {
    const error = this.accounts.error();
    return error ? friendlyMessage(error) : '';
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    await this.accounts.load();
  }

  protected async start(): Promise<void> {
    this.starting.set(true);
    this.problem.set(null);
    const back = this.returnPath();
    const returnUrl = back ? `${RETURN_PATH}?returnTo=${encodeURIComponent(back)}` : RETURN_PATH;
    try {
      const onboarding = await this.accounts.startOnboarding(returnUrl);
      const path = safeAppPath(onboarding.url);
      if (path) {
        if (onboarding.account.ready) {
          this.snackBar.open('Payouts are set up.', 'OK', { duration: 5000 });
        }
        await this.router.navigateByUrl(path);
      } else if (/^https:\/\//.test(onboarding.url)) {
        window.location.assign(onboarding.url);
      }
    } catch (error) {
      this.problem.set(friendlyMessage(toApiError(error)));
    } finally {
      this.starting.set(false);
    }
  }
}
