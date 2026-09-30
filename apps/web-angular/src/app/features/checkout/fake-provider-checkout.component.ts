import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import type { StatusInfo } from '../../shared/offers/offer-labels';
import { StatusChipComponent } from '../../shared/offers/status-chip.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import type { ProviderCheckoutStatus } from './data/provider-checkout.store';

/**
 * Presentational card of a local fake provider checkout (subscription or donation): the "Local
 * test payment" banner, what is paid, the status, "Pay" / "Simulate a failed payment", the wait
 * for the provider and how it ended. The page owns the store and the navigation.
 */
@Component({
  selector: 'app-fake-provider-checkout',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SkeletonComponent,
    StatusChipComponent,
  ],
  template: `
    <p class="co__banner" role="note" data-testid="local-payment-banner">
      <mat-icon aria-hidden="true">science</mat-icon>
      <span>
        <strong>Local test payment.</strong> This page stands in for the payment provider on a
        development machine: no card is asked for and no real money moves.
      </span>
    </p>
    @if (status() === 'loading') {
      <div class="co__card" aria-busy="true">
        <span class="visually-hidden">Loading the checkout</span>
        <app-skeleton height="24px" width="40%" />
        <app-skeleton height="32px" width="70%" />
        <app-skeleton height="56px" />
      </div>
    } @else {
      <section class="co__card" aria-labelledby="co-title">
        <p class="co__eyebrow">
          <mat-icon aria-hidden="true">{{ icon() }}</mat-icon>
          {{ eyebrow() }}
        </p>
        <h1 id="co-title" class="co__title">{{ heading() }}</h1>
        @if (summary()) {
          <p class="co__summary">{{ summary() }}</p>
        }
        <p class="co__amount" data-testid="checkout-amount">
          {{ amount() }}
          @if (per()) {
            <span class="co__per">{{ per() }}</span>
          }
        </p>
        <app-status-chip
          class="co__status"
          [label]="statusInfo().label"
          [icon]="statusInfo().icon"
          [tone]="statusInfo().tone"
        />

        @if (problem()) {
          <p class="co__problem" role="alert">
            <mat-icon aria-hidden="true">error</mat-icon>
            {{ problem() }}
          </p>
        }

        @switch (status()) {
          @case ('ready') {
            @if (note()) {
              <p class="co__note">
                <mat-icon aria-hidden="true">info</mat-icon>
                {{ note() }}
              </p>
            }
            <div class="co__actions">
              <button matButton="filled" type="button" class="co__pay" (click)="pay.emit()">
                <mat-icon aria-hidden="true">lock</mat-icon>
                {{ payLabel() }}
              </button>
              <button matButton="outlined" type="button" (click)="decline.emit()">
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
            <p
              class="co__done"
              [class.co__done--ok]="outcome() === 'succeeded'"
              aria-live="polite"
              data-testid="checkout-outcome"
            >
              <mat-icon aria-hidden="true">{{ outcomeIcon() }}</mat-icon>
              {{ doneText() }}
            </p>
            <div class="co__actions">
              @if (retryable() && outcome() === 'failed') {
                <button matButton="filled" type="button" (click)="tryAgain.emit()">
                  Try again
                </button>
              }
              <a
                [matButton]="retryable() && outcome() === 'failed' ? 'outlined' : 'filled'"
                [routerLink]="backLink()"
              >
                {{ doneLabel() }}
              </a>
            </div>
          }
        }
        @if (status() !== 'done') {
          <a class="co__back" [routerLink]="backLink()">
            <mat-icon aria-hidden="true">arrow_back</mat-icon>
            {{ backLabel() }}
          </a>
        }
      </section>
      <ng-content />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-5);
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
      align-items: flex-start;
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
      color: var(--color-accent);
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
    .co__summary {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .co__amount {
      margin: 0;
      color: var(--color-ink);
      font-family: var(--font-display);
      font-size: var(--font-size-3xl);
      font-weight: var(--font-weight-semibold);
      font-variant-numeric: tabular-nums;
    }
    .co__per {
      color: var(--color-text-muted);
      font-family: var(--font-body);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-regular);
    }
    .co__waiting,
    .co__problem,
    .co__note,
    .co__done {
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
    .co__done {
      color: var(--color-ink);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-medium);
    }
    .co__done mat-icon {
      color: var(--color-danger);
    }
    .co__done--ok mat-icon {
      color: var(--color-success);
    }
    .co__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
      width: 100%;
    }
    .co__pay {
      flex: 1 1 200px;
    }
    .co__back {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      text-decoration: none;
    }
    .co__back:hover {
      color: var(--color-accent);
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
export class FakeProviderCheckoutComponent {
  readonly status = input.required<ProviderCheckoutStatus>();
  readonly outcome = input<string | null>(null);
  readonly eyebrow = input.required<string>();
  readonly icon = input('lock');
  readonly heading = input.required<string>();
  readonly summary = input<string | null>(null);
  readonly amount = input.required<string>();
  /** Suffix of the amount ("per month"). */
  readonly per = input<string | null>(null);
  readonly statusInfo = input.required<StatusInfo>();
  readonly payLabel = input.required<string>();
  /** Shown above the buttons (a declined earlier attempt). */
  readonly note = input<string | null>(null);
  readonly problem = input<string | null>(null);
  readonly doneText = input.required<string>();
  readonly doneLabel = input.required<string>();
  readonly backLink = input.required<string>();
  readonly backLabel = input.required<string>();
  /** A declined attempt leaves the checkout open ("Try again"). */
  readonly retryable = input(false);

  readonly pay = output<void>();
  readonly decline = output<void>();
  readonly tryAgain = output<void>();

  protected outcomeIcon(): string {
    switch (this.outcome()) {
      case 'succeeded':
        return 'check_circle';
      case 'pending':
        return 'schedule';
      default:
        return 'error';
    }
  }
}
