import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { CreditEntry } from '@orenji/api-client';
import {
  creditReasonLabel,
  creditTypeLabel,
  signedCredits,
} from '../../shared/billing/billing-labels';

/** The append-only credit history, newest first, with "Load more" (cursor pages). */
@Component({
  selector: 'app-credit-ledger',
  imports: [DatePipe, MatButtonModule, MatIconModule],
  template: `
    @if (entries().length) {
      <ol class="ledger" aria-label="Credit history">
        @for (entry of entries(); track entry.id) {
          <li class="ledger__row" data-testid="ledger-entry">
            <span
              class="ledger__icon"
              [class.ledger__icon--minus]="(entry.amount ?? 0) < 0"
              aria-hidden="true"
            >
              <mat-icon>{{ (entry.amount ?? 0) < 0 ? 'remove' : 'add' }}</mat-icon>
            </span>
            <span class="ledger__what">
              <strong>{{ reason(entry) }}</strong>
              <span class="ledger__meta">
                {{ type(entry.type) }} · {{ entry.createdAt | date: 'MMM d, y, h:mm a' }}
                @if (entry.expiresAt) {
                  · unlocked until {{ entry.expiresAt | date: 'MMM d, h:mm a' }}
                }
              </span>
            </span>
            <span class="ledger__amounts">
              <span
                class="ledger__amount"
                [class.ledger__amount--minus]="(entry.amount ?? 0) < 0"
                data-testid="ledger-amount"
                >{{ signed(entry.amount) }}</span
              >
              <span class="ledger__after">Balance {{ entry.balanceAfter ?? '—' }}</span>
            </span>
          </li>
        }
      </ol>
      @if (hasMore() || moreFailed()) {
        <div class="ledger__more">
          @if (moreFailed()) {
            <span class="ledger__failed" role="alert">Older entries could not load.</span>
          }
          <button
            matButton="outlined"
            type="button"
            [disabled]="loadingMore()"
            (click)="loadMore.emit()"
          >
            {{ loadingMore() ? 'Loading…' : moreFailed() ? 'Try again' : 'Load more' }}
          </button>
        </div>
      }
    } @else {
      <p class="ledger__none">
        No credits yet. Invite a collector with your referral code to earn your first ones.
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .ledger {
      margin: 0;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      list-style: none;
      overflow: hidden;
    }
    .ledger__row {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-3) var(--spacing-4);
    }
    .ledger__row + .ledger__row {
      border-top: 1px solid var(--color-border);
    }
    .ledger__icon {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--color-success) 16%, var(--color-surface));
      color: var(--color-success);
    }
    .ledger__icon--minus {
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    .ledger__what {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
    }
    .ledger__meta,
    .ledger__after,
    .ledger__none {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .ledger__none {
      margin: 0;
      font-size: var(--font-size-sm);
    }
    .ledger__amounts {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      flex: 0 0 auto;
    }
    .ledger__amount {
      color: var(--color-success);
      font-weight: var(--font-weight-semibold);
      font-variant-numeric: tabular-nums;
    }
    .ledger__amount--minus {
      color: var(--color-ink);
    }
    .ledger__more {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-3);
      margin-top: var(--spacing-3);
    }
    .ledger__failed {
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditLedgerComponent {
  readonly entries = input.required<readonly CreditEntry[]>();
  readonly productNames = input<Record<string, string>>({});
  readonly hasMore = input(false);
  readonly loadingMore = input(false);
  readonly moreFailed = input(false);

  readonly loadMore = output<void>();

  protected readonly signed = signedCredits;
  protected readonly type = creditTypeLabel;

  protected reason(entry: CreditEntry): string {
    return creditReasonLabel(entry.reason, this.productNames()[entry.product ?? ''] ?? null);
  }
}
