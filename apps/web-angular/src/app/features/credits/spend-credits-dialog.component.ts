import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { CreditProduct, CreditSpend } from '@orenji/api-client';
import { ApiError, isApiError } from '../../core/http/api-error';
import {
  CREDITS_NOT_CASH,
  creditsLabel,
  durationLabel,
  newIdempotencyKey,
  spendProblem,
} from '../../shared/billing/billing-labels';

export interface SpendCreditsDialogData {
  product: CreditProduct;
  balance: number;
  /** Performs the spend (the page's store); the dialog keeps one idempotency key. */
  spend: (productKey: string, idempotencyKey: string) => Promise<CreditSpend | ApiError>;
}

/**
 * Confirms a credit spend: cost, balance after, duration. The idempotency key is created once
 * when the dialog opens and reused for every retry inside it, so a lost answer never spends twice
 * (`POST /me/credits/spend` answers the original result, `duplicate: true`). Closes with the
 * result on success; refusals (409 INSUFFICIENT_CREDITS …) are explained inline.
 */
@Component({
  selector: 'app-spend-credits-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <h2 mat-dialog-title>Unlock {{ data.product.name }}?</h2>
    <mat-dialog-content>
      @if (data.product.description) {
        <p class="spend__text">{{ data.product.description }}</p>
      }
      <dl class="spend__facts">
        <div>
          <dt>Cost</dt>
          <dd data-testid="spend-cost">{{ credits(data.product.cost) }}</dd>
        </div>
        <div>
          <dt>Balance after</dt>
          <dd>{{ credits(data.balance - (data.product.cost ?? 0)) }}</dd>
        </div>
        <div>
          <dt>Lasts</dt>
          <dd>{{ duration(data.product.durationHours) }}</dd>
        </div>
      </dl>
      <p class="spend__fine">
        Starts now, or right after an active unlock of the same feature. {{ notCash }}
      </p>
      @if (problem(); as message) {
        <p class="spend__problem" role="alert">
          <mat-icon aria-hidden="true">error</mat-icon>
          {{ message }}
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close [disabled]="busy()">Cancel</button>
      <button matButton="filled" type="button" [disabled]="busy()" (click)="confirm()">
        @if (busy()) {
          <mat-spinner diameter="18" aria-hidden="true" />
        }
        Unlock for {{ credits(data.product.cost) }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .spend__text,
    .spend__fine {
      margin: 0 0 var(--spacing-3);
      color: var(--color-text-muted);
    }
    .spend__fine {
      font-size: var(--font-size-sm);
    }
    .spend__facts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--spacing-3);
      margin: 0 0 var(--spacing-3);
      padding: var(--spacing-3);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
    }
    .spend__facts dt {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .spend__facts dd {
      margin: 0;
      font-weight: var(--font-weight-semibold);
      font-variant-numeric: tabular-nums;
    }
    .spend__problem {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
    }
    .spend__problem {
      color: var(--color-danger);
    }
    mat-spinner {
      display: inline-block;
      margin-right: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpendCreditsDialogComponent {
  protected readonly data = inject<SpendCreditsDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<SpendCreditsDialogComponent, CreditSpend>>(MatDialogRef);

  /** Fixed for the life of the dialog (see the class comment). */
  readonly idempotencyKey = newIdempotencyKey('spend');
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly credits = creditsLabel;
  protected readonly duration = durationLabel;
  protected readonly notCash = CREDITS_NOT_CASH;

  protected async confirm(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.problem.set(null);
    const result = await this.data.spend(this.data.product.key ?? '', this.idempotencyKey);
    this.busy.set(false);
    if (isApiError(result)) {
      this.problem.set(spendProblem(result));
      return;
    }
    this.ref.close(result);
  }
}
