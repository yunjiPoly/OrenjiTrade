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
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { money, paymentStatusInfo } from '../../shared/payments/payment-labels';
import { ProtectionExplainerComponent } from '../../shared/payments/protection-explainer.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { FakeCheckoutStore } from './data/fake-checkout.store';

/**
 * `/checkout/fake/:ref`: the local stand-in for a payment provider's hosted checkout (only with
 * the fake provider; the buyer only, anybody else gets the not-found state). A banner says it is
 * a local test payment: no card is asked for and no money moves. "Pay" and "Simulate a failed
 * payment" send the synthetic webhook; once the provider answered, the buyer goes back to the
 * trade (`?payment=secured|failed`).
 */
@Component({
  selector: 'app-fake-checkout-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    EmptyStateComponent,
    ErrorStateComponent,
    ProtectionExplainerComponent,
    SkeletonComponent,
  ],
  providers: [FakeCheckoutStore],
  template: `
    <div class="page co">
      <p class="co__banner" role="note" data-testid="local-payment-banner">
        <mat-icon aria-hidden="true">science</mat-icon>
        <span>
          <strong>Local test payment.</strong> This page stands in for the payment provider on a
          development machine: no card is asked for and no real money moves.
        </span>
      </p>
      @switch (store.status()) {
        @case ('loading') {
          <div class="co__card" aria-busy="true">
            <span class="visually-hidden">Loading the checkout</span>
            <app-skeleton height="32px" width="60%" />
            <app-skeleton height="96px" />
            <app-skeleton height="48px" />
          </div>
        }
        @case ('not-found') {
          <app-empty-state
            icon="credit_card_off"
            title="This checkout is not available"
            description="It does not exist, it belongs to another collector, or this payment provider has no local checkout."
          >
            <a actions matButton="filled" routerLink="/trades">My trades</a>
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
          @if (store.checkout(); as checkout) {
            <section class="co__card" aria-labelledby="co-title">
              <p class="co__eyebrow">
                <mat-icon aria-hidden="true">lock</mat-icon>
                Protected payment
              </p>
              <h1 id="co-title" class="co__title">{{ checkout.summary }}</h1>
              <p class="co__amount" data-testid="checkout-amount">
                {{ amount() }}
              </p>
              <p class="co__status">
                <mat-icon aria-hidden="true">{{ status().icon }}</mat-icon>
                {{ status().label }}
              </p>

              @if (store.error()) {
                <p class="co__problem" role="alert">
                  <mat-icon aria-hidden="true">error</mat-icon>
                  {{ problem() }}
                </p>
              }

              @switch (store.status()) {
                @case ('ready') {
                  <div class="co__actions">
                    <button
                      matButton="filled"
                      type="button"
                      class="co__pay"
                      (click)="confirm('SUCCEEDED')"
                    >
                      <mat-icon aria-hidden="true">lock</mat-icon>
                      Pay {{ amount() }}
                    </button>
                    <button matButton="outlined" type="button" (click)="confirm('FAILED')">
                      Simulate a failed payment
                    </button>
                  </div>
                }
                @case ('processing') {
                  <p class="co__waiting" aria-live="polite">
                    <mat-spinner diameter="20" aria-hidden="true" />
                    Waiting for the payment provider…
                  </p>
                }
                @case ('done') {
                  <p class="co__done" aria-live="polite">{{ doneText() }}</p>
                  <a matButton="filled" [routerLink]="['/trades', checkout.tradeId]">
                    Back to the trade
                  </a>
                }
              }
              <a class="co__back" [routerLink]="['/trades', checkout.tradeId]">
                <mat-icon aria-hidden="true">arrow_back</mat-icon>
                Cancel and return to the trade
              </a>
            </section>
            <app-protection-explainer class="co__explainer" />
          }
        }
      }
    </div>
  `,
  styles: `
    .co {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: var(--spacing-5);
      max-width: 560px;
    }
    .co__banner {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-3);
      margin: 0;
      padding: var(--spacing-3) var(--spacing-4);
      border: 1px dashed var(--color-warning);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-warning) 14%, var(--color-surface));
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
    .co__banner mat-icon {
      flex: 0 0 auto;
      color: var(--color-warning);
    }
    .co__card {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      padding: var(--spacing-6);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--elevation-floating);
    }
    .co__eyebrow {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      margin: 0;
      color: var(--color-success);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .co__eyebrow mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .co__title {
      margin: 0;
      font-size: var(--font-size-xl);
    }
    .co__amount {
      margin: 0;
      color: var(--color-ink);
      font-family: var(--font-display);
      font-size: var(--font-size-3xl);
      font-weight: var(--font-weight-semibold);
      font-variant-numeric: tabular-nums;
    }
    .co__status,
    .co__waiting,
    .co__problem {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .co__problem {
      color: var(--color-danger);
    }
    .co__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
    }
    .co__pay {
      flex: 1 1 200px;
    }
    .co__done {
      margin: 0;
      font-weight: var(--font-weight-medium);
    }
    .co__back {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      text-decoration: none;
    }
    .co__back mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    @media (max-width: 599px) {
      .co__card {
        padding: var(--spacing-4);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FakeCheckoutPageComponent {
  protected readonly store = inject(FakeCheckoutStore);
  private readonly router = inject(Router);

  /** Route parameter (bound by the router). */
  readonly ref = input.required<string>();

  protected readonly amount = computed(() => {
    const checkout = this.store.checkout();
    return checkout ? money(checkout.amount, checkout.currency) : '';
  });
  protected readonly status = computed(() => paymentStatusInfo(this.store.checkout()?.status));
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly problem = computed(() => {
    const error = this.store.error();
    return error ? `The payment could not start: ${friendlyMessage(error)}` : '';
  });
  protected readonly doneText = computed(() => {
    switch (this.store.outcome()) {
      case 'secured':
        return 'This payment is secured: the payment provider holds it until the buyer confirms receipt.';
      case 'failed':
        return 'This payment did not go through. Nothing was charged; you can try again from the trade.';
      case 'cancelled':
        return 'This checkout was cancelled.';
      default:
        return 'The payment provider has not answered yet. The trade page updates as soon as it does.';
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
    const checkout = this.store.checkout();
    if (!checkout || (result !== 'secured' && result !== 'failed')) {
      return;
    }
    await this.router.navigate(['/trades', checkout.tradeId], {
      queryParams: { payment: result },
      replaceUrl: true,
    });
  }
}
