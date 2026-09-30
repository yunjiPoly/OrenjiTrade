import { DestroyRef, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';

export type ProviderCheckoutStatus =
  'loading' | 'ready' | 'processing' | 'done' | 'not-found' | 'error';
/** How a checkout ended: paid, declined (may be retried), cancelled, or no answer yet. */
export type ProviderCheckoutOutcome = 'succeeded' | 'failed' | 'cancelled' | 'pending';

export type ConfirmOutcome = 'SUCCEEDED' | 'FAILED';

/**
 * Shared state machine of the local fake provider checkouts (subscriptions and donations):
 * read the checkout, "Pay" or "Simulate a failure" through the confirm route (the API emits a
 * signed synthetic webhook through its regular pipeline), then poll the checkout until the
 * webhook changed it (webhooks are applied asynchronously; about 45 s at most). Never real
 * money. Subclasses bind the generated client and say how a checkout ended.
 */
export abstract class ProviderCheckoutStore<T> {
  private readonly checkoutState = signal<T | null>(null);
  private readonly statusState = signal<ProviderCheckoutStatus>('loading');
  private readonly outcomeState = signal<ProviderCheckoutOutcome | null>(null);
  private readonly errorState = signal<ApiError | null>(null);

  readonly checkout = this.checkoutState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly outcome = this.outcomeState.asReadonly();
  readonly error = this.errorState.asReadonly();

  /** Delay between two reads while waiting for the webhook (tests shorten it). */
  pollDelayMs = 750;
  /** Reads before giving up. */
  maxPolls = 60;

  private ref: string | null = null;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  /** `GET` of the checkout (the member's own; 404 for anybody else). */
  protected abstract read(ref: string): Observable<T>;
  /** `POST …/confirm` with the simulated outcome. */
  protected abstract send(ref: string, outcome: ConfirmOutcome): Observable<unknown>;
  /**
   * How the checkout ended, or `null` while it still waits. `requested` is the outcome just
   * sent (`null` on the first read): a declined attempt leaves some checkouts open for a retry.
   */
  protected abstract outcomeOf(
    checkout: T,
    requested: ConfirmOutcome | null,
  ): ProviderCheckoutOutcome | null;

  async load(ref: string): Promise<void> {
    this.ref = ref;
    this.statusState.set('loading');
    this.errorState.set(null);
    this.outcomeState.set(null);
    try {
      const checkout = await firstValueFrom(this.read(ref));
      this.checkoutState.set(checkout);
      const outcome = this.outcomeOf(checkout, null);
      this.outcomeState.set(outcome);
      this.statusState.set(outcome ? 'done' : 'ready');
    } catch (error) {
      this.fail(toApiError(error));
    }
  }

  retry(): void {
    if (this.ref) {
      void this.load(this.ref);
    }
  }

  /** Back to the pay buttons after a declined attempt that left the checkout open. */
  tryAgain(): void {
    if (this.statusState() === 'done' && this.outcomeState() === 'failed') {
      this.outcomeState.set(null);
      this.statusState.set('ready');
    }
  }

  /** Pays (`SUCCEEDED`) or simulates a declined payment (`FAILED`); resolves the outcome. */
  async confirm(outcome: ConfirmOutcome): Promise<ProviderCheckoutOutcome | null> {
    const ref = this.ref;
    if (!ref || this.statusState() !== 'ready') {
      return null;
    }
    this.statusState.set('processing');
    this.errorState.set(null);
    try {
      await firstValueFrom(this.send(ref, outcome));
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.status !== 409) {
        this.errorState.set(apiError);
        this.statusState.set('ready');
        return null;
      }
      // 409: the checkout is no longer waiting (paid elsewhere, cancelled): read how it ended.
    }
    return this.waitForOutcome(ref, outcome);
  }

  private async waitForOutcome(
    ref: string,
    requested: ConfirmOutcome,
  ): Promise<ProviderCheckoutOutcome> {
    for (let attempt = 0; attempt < this.maxPolls && !this.destroyed; attempt++) {
      try {
        const checkout = await firstValueFrom(this.read(ref));
        this.checkoutState.set(checkout);
        const outcome = this.outcomeOf(checkout, requested);
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
