import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import {
  FakeCheckout,
  FakeCheckoutConfirmRequestOutcomeEnum,
  PaymentsService,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';

export type FakeCheckoutStatus =
  'loading' | 'ready' | 'processing' | 'done' | 'not-found' | 'error';
export type FakeCheckoutOutcome = 'secured' | 'failed' | 'cancelled' | 'pending';

/** Maps a payment status to how the checkout ended (`null` while it still waits to be paid). */
export function checkoutOutcome(status: string): FakeCheckoutOutcome | null {
  switch (status) {
    case 'REQUIRES_ACTION':
      return null;
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
    case 'REFUNDED':
      return 'cancelled';
    default:
      return 'secured';
  }
}

/**
 * The local fake provider's checkout (`GET /payments/fake/{ref}`, buyer only): paying (or
 * simulating a failure) sends `POST /payments/fake/{ref}/confirm`, which emits a signed synthetic
 * webhook through the regular pipeline; the payment changes asynchronously, so the store polls
 * the checkout until it left REQUIRES_ACTION (about 45 s at most). Never real money. Provided by
 * the checkout page.
 */
@Injectable()
export class FakeCheckoutStore {
  private readonly api = inject(PaymentsService);

  private readonly checkoutState = signal<FakeCheckout | null>(null);
  private readonly statusState = signal<FakeCheckoutStatus>('loading');
  private readonly outcomeState = signal<FakeCheckoutOutcome | null>(null);
  private readonly errorState = signal<ApiError | null>(null);

  readonly checkout = this.checkoutState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly outcome = this.outcomeState.asReadonly();
  readonly error = this.errorState.asReadonly();

  /** Delay between two reads while waiting for the webhook (tests shorten it). */
  pollDelayMs = 750;
  /** Reads before giving up (about 45 s: webhooks are applied asynchronously). */
  maxPolls = 60;

  private ref: string | null = null;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  async load(ref: string): Promise<void> {
    this.ref = ref;
    this.statusState.set('loading');
    this.errorState.set(null);
    this.outcomeState.set(null);
    try {
      const checkout = await this.read(ref);
      this.show(checkout);
    } catch (error) {
      this.fail(toApiError(error));
    }
  }

  retry(): void {
    if (this.ref) {
      void this.load(this.ref);
    }
  }

  /** Pays (`SUCCEEDED`) or simulates a declined payment (`FAILED`); resolves the outcome. */
  async confirm(outcome: 'SUCCEEDED' | 'FAILED'): Promise<FakeCheckoutOutcome | null> {
    const ref = this.ref;
    if (!ref || this.statusState() !== 'ready') {
      return null;
    }
    this.statusState.set('processing');
    this.errorState.set(null);
    try {
      await firstValueFrom(
        this.api.confirmFakeCheckout(
          {
            ref,
            fakeCheckoutConfirmRequest: {
              outcome: outcome as FakeCheckoutConfirmRequestOutcomeEnum,
            },
          },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.status !== 409) {
        this.errorState.set(apiError);
        this.statusState.set('ready');
        return null;
      }
      // 409: the checkout is no longer waiting (paid elsewhere, cancelled): read how it ended.
    }
    return this.waitForOutcome(ref);
  }

  private async waitForOutcome(ref: string): Promise<FakeCheckoutOutcome> {
    for (let attempt = 0; attempt < this.maxPolls && !this.destroyed; attempt++) {
      try {
        const checkout = await this.read(ref);
        this.checkoutState.set(checkout);
        const outcome = checkoutOutcome(checkout.status);
        if (outcome) {
          this.outcomeState.set(outcome);
          this.statusState.set('done');
          return outcome;
        }
      } catch {
        // A lost answer: try again after the delay.
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollDelayMs));
    }
    this.outcomeState.set('pending');
    this.statusState.set('done');
    return 'pending';
  }

  private read(ref: string): Promise<FakeCheckout> {
    return firstValueFrom(
      this.api.getFakeCheckout({ ref }, 'body', false, { context: silentErrors() }),
    );
  }

  private show(checkout: FakeCheckout): void {
    this.checkoutState.set(checkout);
    const outcome = checkoutOutcome(checkout.status);
    this.outcomeState.set(outcome);
    this.statusState.set(outcome ? 'done' : 'ready');
  }

  private fail(error: ApiError): void {
    this.checkoutState.set(null);
    if (error.status === 404 || error.status === 403 || error.errorCode === 'VALIDATION_FAILED') {
      this.statusState.set('not-found');
    } else {
      this.errorState.set(error);
      this.statusState.set('error');
    }
  }
}
