import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { SellerAccountService } from '../../../shared/payments/seller-account.service';

/**
 * A seller's reminder on a protected trade that waits for the payment: the buyer can only pay
 * once the seller's payout account is ready (409 SELLER_NOT_ONBOARDED otherwise). Reads
 * `GET /me/seller-account` and links to Settings → Payouts, which brings the seller back here.
 */
@Component({
  selector: 'app-trade-payout-setup',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    @if (needed()) {
      <section class="ps" aria-labelledby="ps-title" data-testid="payout-setup">
        <mat-icon aria-hidden="true" class="ps__icon">account_balance</mat-icon>
        <div class="ps__text">
          <h2 id="ps-title" class="ps__title">Set up payouts to get paid</h2>
          <p class="ps__body">
            {{ buyerName() }} can pay with payment protection as soon as your payout account is
            ready. The payment provider handles it: OrenjiTrade never sees your bank details.
          </p>
        </div>
        <a
          matButton="filled"
          routerLink="/settings/payouts"
          [queryParams]="{ returnTo: '/trades/' + tradeId() }"
        >
          Set up payouts
        </a>
      </section>
    }
  `,
  styles: `
    .ps {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--spacing-3) var(--spacing-4);
      margin-bottom: var(--spacing-4);
      padding: var(--spacing-4);
      border-radius: var(--radius-lg);
      background: var(--color-accent-container);
      color: var(--color-on-accent-container);
    }
    .ps__title {
      margin: 0;
      font-size: var(--font-size-lg);
    }
    .ps__body {
      margin: var(--spacing-1) 0 0;
      font-size: var(--font-size-sm);
    }
    @media (max-width: 599px) {
      .ps {
        grid-template-columns: auto minmax(0, 1fr);
      }
      .ps a {
        grid-column: 1 / -1;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradePayoutSetupComponent {
  private readonly accounts = inject(SellerAccountService);

  readonly tradeId = input.required<string>();
  readonly buyerName = input.required<string>();

  protected readonly needed = computed(
    () => this.accounts.status() === 'ready' && !this.accounts.ready(),
  );

  constructor() {
    void this.accounts.load();
  }
}
