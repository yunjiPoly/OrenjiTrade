import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CREDITS_NOT_CASH } from '../../shared/billing/billing-labels';

/** The member's credit balance with the "not money" wording the contract requires. */
@Component({
  selector: 'app-credit-balance',
  imports: [MatIconModule],
  template: `
    <section class="balance" aria-labelledby="balance-title">
      <span class="balance__coin" aria-hidden="true"><mat-icon>toll</mat-icon></span>
      <div class="balance__body">
        <h2 id="balance-title" class="balance__label">Your balance</h2>
        <p class="balance__value" data-testid="credit-balance" aria-live="polite">
          {{ balance().toLocaleString('en-CA') }}
          <span class="balance__unit">{{ balance() === 1 ? 'credit' : 'credits' }}</span>
        </p>
        <p class="balance__note">
          <mat-icon aria-hidden="true">info</mat-icon>
          {{ note }}
        </p>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .balance {
      display: flex;
      align-items: center;
      gap: var(--spacing-5);
      padding: var(--spacing-6);
      border-radius: var(--radius-lg);
      background: linear-gradient(
        135deg,
        var(--color-primary-container),
        color-mix(in srgb, var(--color-accent) 18%, var(--color-surface))
      );
      color: var(--color-on-primary-container);
    }
    .balance__coin {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: var(--color-primary);
      color: var(--color-on-primary);
      box-shadow: var(--elevation-floating);
    }
    .balance__coin mat-icon {
      width: 40px;
      height: 40px;
      font-size: 40px;
    }
    .balance__body {
      min-width: 0;
    }
    .balance__label {
      margin: 0;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
    }
    .balance__value {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-4xl);
      font-weight: var(--font-weight-semibold);
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
    }
    .balance__unit {
      font-family: var(--font-body);
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-regular);
    }
    .balance__note {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-1);
      margin: var(--spacing-2) 0 0;
      font-size: var(--font-size-sm);
    }
    .balance__note mat-icon {
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    @media (max-width: 599px) {
      .balance {
        flex-direction: column;
        align-items: flex-start;
        padding: var(--spacing-4);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditBalanceComponent {
  readonly balance = input.required<number>();
  protected readonly note = CREDITS_NOT_CASH;
}
