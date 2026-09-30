import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { DisputeSummary } from '@orenji/api-client';
import { StatusChipComponent } from '../../../shared/offers/status-chip.component';
import {
  disputeReasonLabel,
  disputeStatusInfo,
  money,
} from '../../../shared/payments/payment-labels';

/** The dispute of a protected trade, with a link to its page (evidence, messages, decision). */
@Component({
  selector: 'app-trade-dispute-card',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, StatusChipComponent],
  template: `
    @let d = dispute();
    <section class="dc" aria-labelledby="dc-title" data-testid="dispute-card">
      <header class="dc__head">
        <h2 id="dc-title" class="dc__title">
          <mat-icon aria-hidden="true">gavel</mat-icon>
          Dispute
        </h2>
        <app-status-chip [label]="status().label" [icon]="status().icon" [tone]="status().tone" />
      </header>
      <p class="dc__reason">{{ reason() }}</p>
      <p class="dc__meta">
        Opened {{ d.openedAt | date: 'MMM d, h:mm a' }}
        @if (d.resolvedAt) {
          · decided {{ d.resolvedAt | date: 'MMM d, h:mm a' }}
        }
      </p>
      @if (d.refundAmount) {
        <p class="dc__meta">Refund: {{ refund() }}</p>
      }
      <a matButton="tonal" [routerLink]="['/disputes', d.id]">
        <mat-icon aria-hidden="true">open_in_new</mat-icon>
        View the dispute
      </a>
    </section>
  `,
  styles: `
    .dc {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-2);
      padding: var(--spacing-4);
      border: 1px solid color-mix(in srgb, var(--color-danger) 35%, var(--color-border));
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--color-danger) 5%, var(--color-surface));
    }
    .dc__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
      width: 100%;
    }
    .dc__title {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
      font-size: var(--font-size-lg);
    }
    .dc__reason {
      margin: 0;
      font-weight: var(--font-weight-semibold);
    }
    .dc__meta {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradeDisputeCardComponent {
  readonly dispute = input.required<DisputeSummary>();
  readonly currency = input<string | null | undefined>(null);

  protected readonly status = computed(() => disputeStatusInfo(this.dispute().status));
  protected readonly reason = computed(() => disputeReasonLabel(this.dispute().reason));
  protected readonly refund = computed(() => money(this.dispute().refundAmount, this.currency()));
}
