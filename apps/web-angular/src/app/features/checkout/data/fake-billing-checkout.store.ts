import { Injectable, inject } from '@angular/core';
import { FakeBillingCheckout, SubscriptionsService } from '@orenji/api-client';
import { Observable } from 'rxjs';
import { silentErrors } from '../../../core/http/http-context';
import { isEntitling } from '../../../shared/billing/billing-labels';
import {
  ConfirmOutcome,
  ProviderCheckoutOutcome,
  ProviderCheckoutStore,
} from './provider-checkout.store';

/**
 * How a subscription checkout ended. A declined attempt leaves the subscription PENDING with a
 * `failureCode` (the member may try again); the webhook of a payment turns it ACTIVE; an
 * abandoned checkout is CANCELLED.
 */
export function billingOutcome(
  checkout: FakeBillingCheckout,
  requested: ConfirmOutcome | null,
): ProviderCheckoutOutcome | null {
  const status = checkout.status as string | undefined;
  if (isEntitling(status)) {
    return 'succeeded';
  }
  if (status === 'CANCELLED' || status === 'EXPIRED') {
    return 'cancelled';
  }
  return requested === 'FAILED' && checkout.failureCode ? 'failed' : null;
}

/**
 * The fake billing provider's checkout (`GET /billing/fake/{ref}`, the member only), shown at
 * `/checkout/fake-billing/:ref`. Provided by the checkout page.
 */
@Injectable()
export class FakeBillingCheckoutStore extends ProviderCheckoutStore<FakeBillingCheckout> {
  private readonly api = inject(SubscriptionsService);

  protected read(ref: string): Observable<FakeBillingCheckout> {
    return this.api.getFakeBillingCheckout({ ref }, 'body', false, { context: silentErrors() });
  }

  protected send(ref: string, outcome: ConfirmOutcome): Observable<unknown> {
    return this.api.confirmFakeBillingCheckout(
      { ref, fakeBillingConfirmRequest: { outcome } },
      'body',
      false,
      { context: silentErrors() },
    );
  }

  protected outcomeOf(
    checkout: FakeBillingCheckout,
    requested: ConfirmOutcome | null,
  ): ProviderCheckoutOutcome | null {
    return billingOutcome(checkout, requested);
  }
}
