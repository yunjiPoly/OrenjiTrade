import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { amountLabel, subscriptionStatusInfo } from '../../shared/billing/billing-labels';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { FakeBillingCheckoutStore } from './data/fake-billing-checkout.store';
import { FakeProviderCheckoutComponent } from './fake-provider-checkout.component';

/**
 * `/checkout/fake-billing/:ref`: the local stand-in for the billing provider's hosted checkout
 * (fake provider only; the member who opened it, anybody else gets the not-found state). "Pay"
 * activates the subscription through a synthetic signed webhook; the member then lands on
 * `/premium?checkout=success` with the new plan. A declined attempt keeps the checkout open.
 */
@Component({
  selector: 'app-fake-billing-checkout-page',
  imports: [
    RouterLink,
    MatButtonModule,
    EmptyStateComponent,
    ErrorStateComponent,
    FakeProviderCheckoutComponent,
  ],
  providers: [FakeBillingCheckoutStore],
  template: `
    <div class="page co-page">
      @switch (store.status()) {
        @case ('not-found') {
          <app-empty-state
            icon="credit_card_off"
            title="This checkout is not available"
            description="It does not exist, it belongs to another member, or this billing provider has no local checkout."
          >
            <a actions matButton="filled" routerLink="/premium">See the plans</a>
          </app-empty-state>
        }
        @case ('error') {
          <app-error-state
            title="The checkout could not load"
            [message]="errorMessage()"
            [requestId]="store.error()?.requestId ?? null"
            (retry)="store.retry()"
          />
        }
        @default {
          <app-fake-provider-checkout
            eyebrow="Monthly subscription"
            icon="workspace_premium"
            [status]="store.status()"
            [outcome]="store.outcome()"
            [heading]="heading()"
            [summary]="store.checkout()?.summary ?? null"
            [amount]="amount()"
            per="per month"
            [statusInfo]="statusInfo()"
            [payLabel]="'Pay ' + amount()"
            [note]="note()"
            [problem]="problem()"
            [doneText]="doneText()"
            [doneLabel]="store.outcome() === 'succeeded' ? 'Go to Premium' : 'Back to the plans'"
            backLink="/premium"
            backLabel="Cancel and return to the plans"
            [retryable]="true"
            (pay)="confirm('SUCCEEDED')"
            (decline)="confirm('FAILED')"
            (tryAgain)="store.tryAgain()"
          >
            <p class="co-page__fine">
              Premium renews every month until you cancel it. Cancel any time from the Premium page:
              the plan stays until the end of the paid period.
            </p>
          </app-fake-provider-checkout>
        }
      }
    </div>
  `,
  styles: `
    .co-page {
      max-width: 560px;
    }
    .co-page__fine {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FakeBillingCheckoutPageComponent {
  protected readonly store = inject(FakeBillingCheckoutStore);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);

  /** Route parameter (bound by the router). */
  readonly ref = input.required<string>();

  protected readonly heading = computed(
    () => `${this.store.checkout()?.planName ?? 'Premium'} subscription`,
  );
  protected readonly amount = computed(() => {
    const checkout = this.store.checkout();
    return checkout ? amountLabel(checkout.amount, checkout.currency) : '';
  });
  protected readonly statusInfo = computed(() =>
    subscriptionStatusInfo(this.store.checkout()?.status),
  );
  protected readonly note = computed(() =>
    this.store.checkout()?.failureCode
      ? 'The last attempt was declined. Nothing was charged: you can try again.'
      : null,
  );
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly problem = computed(() => {
    const error = this.store.error();
    return error && this.store.status() !== 'error'
      ? `The payment could not start: ${friendlyMessage(error)}`
      : null;
  });
  protected readonly doneText = computed(() => {
    switch (this.store.outcome()) {
      case 'succeeded':
        return 'Payment received: Premium is active.';
      case 'failed':
        return 'The payment was declined. Nothing was charged.';
      case 'cancelled':
        return 'This checkout was closed. Start a new one from the plans.';
      default:
        return 'The billing provider has not answered yet. The Premium page updates as soon as it does.';
    }
  });

  constructor() {
    effect(() => {
      const ref = this.ref();
      untracked(() => void this.store.load(ref));
    });
  }

  protected async confirm(outcome: 'SUCCEEDED' | 'FAILED'): Promise<void> {
    const result = await this.store.confirm(outcome);
    if (result !== 'succeeded') {
      return;
    }
    // The plan and the PREMIUM_USER role changed: refresh the session before leaving.
    await this.session.load();
    await this.router.navigate(['/premium'], {
      queryParams: { checkout: 'success' },
      replaceUrl: true,
    });
  }
}
