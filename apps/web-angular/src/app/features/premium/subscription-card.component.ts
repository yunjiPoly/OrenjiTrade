import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { MySubscription } from '@orenji/api-client';
import {
  amountLabel,
  checkoutTarget,
  isEntitling,
  subscriptionStatusInfo,
} from '../../shared/billing/billing-labels';
import { StatusChipComponent } from '../../shared/offers/status-chip.component';

/**
 * The member's live subscription on `/premium`: plan, status, price, period and what happens
 * next (renewal, end at the period end, overdue payment), with "Cancel at period end" / "Cancel
 * now", or, for an open checkout, "Continue to checkout" / "Close the checkout".
 */
@Component({
  selector: 'app-subscription-card',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, StatusChipComponent],
  template: `
    <section class="sub" aria-labelledby="sub-title" data-testid="subscription-card">
      <div class="sub__head">
        <span class="sub__icon" aria-hidden="true"><mat-icon>workspace_premium</mat-icon></span>
        <div class="sub__titles">
          <h2 id="sub-title" class="sub__title">
            {{ subscription().planName ?? subscription().planCode }} subscription
          </h2>
          <p class="sub__price">{{ price() }} / month</p>
        </div>
        <app-status-chip [label]="status().label" [icon]="status().icon" [tone]="status().tone" />
      </div>

      <p class="sub__text" data-testid="subscription-text">{{ text() }}</p>
      @if (subscription().status === 'PAST_DUE') {
        <p class="sub__warning" role="note">
          <mat-icon aria-hidden="true">warning</mat-icon>
          Your last renewal did not go through. Premium stays active while the billing provider
          tries again.
        </p>
      }

      <dl class="sub__facts">
        @if (subscription().activatedAt) {
          <div>
            <dt>Member since</dt>
            <dd>{{ subscription().activatedAt | date: 'mediumDate' }}</dd>
          </div>
        }
        @if (subscription().currentPeriodEnd && entitling()) {
          <div>
            <dt>{{ subscription().cancelAtPeriodEnd ? 'Ends on' : 'Renews on' }}</dt>
            <dd data-testid="subscription-period-end">
              {{ subscription().currentPeriodEnd | date: 'mediumDate' }}
            </dd>
          </div>
        }
        <div>
          <dt>Billed by</dt>
          <dd>{{ provider() }}</dd>
        </div>
      </dl>

      <div class="sub__actions">
        @if (subscription().status === 'PENDING') {
          @if (checkoutPath(); as path) {
            <a matButton="filled" [routerLink]="path">
              <mat-icon aria-hidden="true">shopping_cart_checkout</mat-icon>
              Continue to checkout
            </a>
          }
          <button matButton="outlined" type="button" [disabled]="busy()" (click)="cancelNow.emit()">
            Close the checkout
          </button>
        } @else if (entitling()) {
          @if (!subscription().cancelAtPeriodEnd) {
            <button
              matButton="outlined"
              type="button"
              [disabled]="busy()"
              (click)="cancelAtPeriodEnd.emit()"
            >
              Cancel at period end
            </button>
          }
          <button
            matButton
            type="button"
            class="sub__danger"
            [disabled]="busy()"
            (click)="cancelNow.emit()"
          >
            Cancel now
          </button>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .sub {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      padding: var(--spacing-5);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--color-primary) 10%, var(--color-surface)),
        var(--color-surface) 60%
      );
    }
    .sub__head {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
    }
    .sub__icon {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .sub__titles {
      flex: 1 1 auto;
      min-width: 0;
    }
    .sub__title {
      margin: 0;
      font-size: var(--font-size-lg);
    }
    .sub__price {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-variant-numeric: tabular-nums;
    }
    .sub__text {
      margin: 0;
    }
    .sub__warning {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-2);
      margin: 0;
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-warning) 14%, var(--color-surface));
      font-size: var(--font-size-sm);
    }
    .sub__warning mat-icon {
      color: var(--color-warning);
    }
    .sub__facts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2) var(--spacing-8);
      margin: 0;
    }
    .sub__facts dt {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .sub__facts dd {
      margin: 0;
      font-weight: var(--font-weight-medium);
    }
    .sub__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
    }
    .sub__actions:empty {
      display: none;
    }
    .sub__danger {
      --mat-button-text-label-text-color: var(--color-danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionCardComponent {
  readonly subscription = input.required<MySubscription>();
  readonly busy = input(false);

  readonly cancelAtPeriodEnd = output<void>();
  /** Cancel at once (also closes an open checkout). */
  readonly cancelNow = output<void>();

  protected readonly status = computed(() => subscriptionStatusInfo(this.subscription().status));
  protected readonly entitling = computed(() => isEntitling(this.subscription().status));
  protected readonly price = computed(() =>
    amountLabel(this.subscription().amount, this.subscription().currency),
  );
  protected readonly provider = computed(() => {
    const provider = this.subscription().provider;
    return provider === 'fake' ? 'Local test billing (no real money)' : (provider ?? '—');
  });
  protected readonly checkoutPath = computed(() => {
    const target = checkoutTarget(this.subscription().checkoutUrl);
    return target?.kind === 'app' ? target.path : null;
  });
  protected readonly text = computed(() => {
    const subscription = this.subscription();
    switch (subscription.status) {
      case 'PENDING':
        return subscription.failureCode
          ? 'Your checkout is still open: the last payment attempt was declined and nothing was charged.'
          : 'Your checkout is still open. Finish paying to start Premium, or close it.';
      case 'TRIAL':
      case 'ACTIVE':
      case 'PAST_DUE':
        return subscription.cancelAtPeriodEnd
          ? 'Cancelled: Premium stays until the end of the paid period, then you are back on the free plan.'
          : 'Premium renews automatically every month. Cancel any time.';
      default:
        return 'This subscription has ended.';
    }
  });
}
