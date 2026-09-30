import { Injectable, inject } from '@angular/core';
import { DonationsService, FakeDonationCheckout } from '@orenji/api-client';
import { Observable } from 'rxjs';
import { silentErrors } from '../../../core/http/http-context';
import {
  ConfirmOutcome,
  ProviderCheckoutOutcome,
  ProviderCheckoutStore,
} from './provider-checkout.store';

/** How a donation checkout ended (`null` while it still waits to be paid). */
export function donationOutcome(checkout: FakeDonationCheckout): ProviderCheckoutOutcome | null {
  switch (checkout.status as string | undefined) {
    case 'SUCCEEDED':
      return 'succeeded';
    case 'FAILED':
      return 'failed';
    case 'REFUNDED':
      return 'cancelled';
    default:
      return null;
  }
}

/**
 * The fake donation provider's checkout (`GET /donations/fake/{ref}`, the donor only), shown at
 * `/checkout/fake-donation/:ref`. Provided by the checkout page.
 */
@Injectable()
export class FakeDonationCheckoutStore extends ProviderCheckoutStore<FakeDonationCheckout> {
  private readonly api = inject(DonationsService);

  protected read(ref: string): Observable<FakeDonationCheckout> {
    return this.api.getFakeDonationCheckout({ ref }, 'body', false, { context: silentErrors() });
  }

  protected send(ref: string, outcome: ConfirmOutcome): Observable<unknown> {
    return this.api.confirmFakeDonationCheckout(
      { ref, fakeDonationConfirmRequest: { outcome } },
      'body',
      false,
      { context: silentErrors() },
    );
  }

  protected outcomeOf(checkout: FakeDonationCheckout): ProviderCheckoutOutcome | null {
    return donationOutcome(checkout);
  }
}
