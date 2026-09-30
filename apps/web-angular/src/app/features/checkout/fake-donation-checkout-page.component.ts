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
import { friendlyMessage } from '../../core/http/api-error-messages';
import {
  DONATION_NOTE,
  amountLabel,
  donationStatusInfo,
} from '../../shared/billing/billing-labels';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { FakeDonationCheckoutStore } from './data/fake-donation-checkout.store';
import { FakeProviderCheckoutComponent } from './fake-provider-checkout.component';

/**
 * `/checkout/fake-donation/:ref`: the local stand-in for the donation provider's checkout (the
 * donor only). "Pay" confirms the voluntary donation through a synthetic signed webhook; the
 * donor then lands on `/support?donation=thanks`.
 */
@Component({
  selector: 'app-fake-donation-checkout-page',
  imports: [
    RouterLink,
    MatButtonModule,
    EmptyStateComponent,
    ErrorStateComponent,
    FakeProviderCheckoutComponent,
  ],
  providers: [FakeDonationCheckoutStore],
  template: `
    <div class="page co-page">
      @switch (store.status()) {
        @case ('not-found') {
          <app-empty-state
            icon="credit_card_off"
            title="This checkout is not available"
            description="It does not exist, it belongs to another member, or this provider has no local checkout."
          >
            <a actions matButton="filled" routerLink="/support">Support OrenjiTrade</a>
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
            eyebrow="Voluntary support"
            icon="volunteer_activism"
            heading="Support OrenjiTrade"
            [status]="store.status()"
            [outcome]="store.outcome()"
            [summary]="store.checkout()?.summary ?? null"
            [amount]="amount()"
            [statusInfo]="statusInfo()"
            [payLabel]="'Donate ' + amount()"
            [problem]="problem()"
            [doneText]="doneText()"
            [doneLabel]="'Back to support'"
            backLink="/support"
            backLabel="Cancel and return"
            (pay)="confirm('SUCCEEDED')"
            (decline)="confirm('FAILED')"
          >
            <p class="co-page__fine">{{ note }}</p>
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
export class FakeDonationCheckoutPageComponent {
  protected readonly store = inject(FakeDonationCheckoutStore);
  private readonly router = inject(Router);

  /** Route parameter (bound by the router). */
  readonly ref = input.required<string>();

  protected readonly note = DONATION_NOTE;
  protected readonly amount = computed(() => {
    const checkout = this.store.checkout();
    return checkout ? amountLabel(checkout.amount, checkout.currency) : '';
  });
  protected readonly statusInfo = computed(() => donationStatusInfo(this.store.checkout()?.status));
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
        return 'Thank you for supporting OrenjiTrade!';
      case 'failed':
        return 'The payment was declined. Nothing was charged; you can start a new donation.';
      case 'cancelled':
        return 'This donation was refunded.';
      default:
        return 'The provider has not answered yet. Your donation history updates as soon as it does.';
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
    if (result === 'succeeded') {
      await this.router.navigate(['/support'], {
        queryParams: { donation: 'thanks' },
        replaceUrl: true,
      });
    }
  }
}
