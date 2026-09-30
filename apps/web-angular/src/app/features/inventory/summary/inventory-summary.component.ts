import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { InventorySummaryResponse } from '@orenji/api-client';
import { endsLabel } from '../../../shared/inventory/inventory-labels';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

/**
 * Summary strip of `/inventory`: totals, what is public right now, private and temporary counts
 * (with the next end), and what needs a confirmation (stale + hidden) with "Confirm all".
 */
@Component({
  selector: 'app-inventory-summary',
  imports: [MatButtonModule, MatIconModule, SkeletonComponent],
  template: `
    <section class="sum" aria-label="Inventory summary">
      @if (summary(); as s) {
        <div class="sum__tile" data-testid="summary-total">
          <span class="sum__label">Cards</span>
          <span class="sum__value">{{ s.totalItems }}</span>
          <span class="sum__hint"
            >{{ s.totalQuantity }} {{ s.totalQuantity === 1 ? 'copy' : 'copies' }}</span
          >
        </div>
        <div class="sum__tile sum__tile--public" data-testid="summary-public">
          <span class="sum__label">
            <mat-icon aria-hidden="true">public</mat-icon>
            Public now
          </span>
          <span class="sum__value">{{ s.effectivePublicCount }}</span>
          <span class="sum__hint">visible to collectors</span>
        </div>
        <div class="sum__tile" data-testid="summary-private">
          <span class="sum__label">
            <mat-icon aria-hidden="true">lock</mat-icon>
            Private
          </span>
          <span class="sum__value">{{ s.byVisibility.PRIVATE }}</span>
          <span class="sum__hint">only you</span>
        </div>
        <div class="sum__tile sum__tile--temporary" data-testid="summary-temporary">
          <span class="sum__label">
            <mat-icon aria-hidden="true">timer</mat-icon>
            Temporarily public
          </span>
          <span class="sum__value">{{ s.byVisibility.TEMPORARILY_PUBLIC }}</span>
          <span class="sum__hint">{{ nextExpiry() ?? 'none running' }}</span>
        </div>
        <div
          class="sum__tile"
          [class.sum__tile--attention]="needsConfirmation() > 0"
          data-testid="summary-stale"
        >
          <span class="sum__label">
            <mat-icon aria-hidden="true">{{
              needsConfirmation() > 0 ? 'history' : 'verified'
            }}</mat-icon>
            Needs confirmation
          </span>
          <span class="sum__value">{{ needsConfirmation() }}</span>
          @if (needsConfirmation() > 0) {
            <button
              matButton="filled"
              type="button"
              class="sum__confirm"
              [disabled]="confirming()"
              (click)="confirmAll.emit()"
            >
              <mat-icon aria-hidden="true">task_alt</mat-icon>
              {{ confirming() ? 'Confirming…' : 'Confirm all' }}
            </button>
          } @else {
            <span class="sum__hint">
              {{ s.agingCount > 0 ? s.agingCount + ' aging soon' : 'Everything is fresh' }}
            </span>
          }
        </div>
      } @else {
        @for (slot of skeletons; track slot) {
          <app-skeleton class="sum__tile sum__tile--loading" height="86px" />
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .sum {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: var(--spacing-3);
    }
    .sum__tile {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      padding: var(--spacing-3) var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .sum__tile--loading {
      padding: 0;
      border: 0;
    }
    .sum__label {
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .sum__label mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .sum__value {
      font-family: var(--font-display);
      font-size: var(--font-size-2xl);
      font-weight: var(--font-weight-semibold);
      font-variant-numeric: tabular-nums;
      line-height: 1.2;
    }
    .sum__hint {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .sum__tile--public .sum__label {
      color: var(--color-accent);
    }
    .sum__tile--temporary .sum__label {
      color: var(--color-primary);
    }
    .sum__tile--attention {
      border-color: color-mix(in srgb, var(--color-status-stale) 55%, var(--color-border));
      background: color-mix(in srgb, var(--color-status-stale) 7%, var(--color-surface));
    }
    .sum__tile--attention .sum__label {
      color: var(--color-status-stale);
    }
    .sum__confirm {
      align-self: flex-start;
      margin-top: 4px;
    }
    @media (max-width: 1099px) {
      .sum {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
    @media (max-width: 599px) {
      .sum {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventorySummaryComponent {
  readonly summary = input<InventorySummaryResponse | null>(null);
  readonly confirming = input(false, { transform: booleanAttribute });
  readonly confirmAll = output<void>();

  protected readonly skeletons = [0, 1, 2, 3, 4];
  protected readonly needsConfirmation = computed(() => {
    const summary = this.summary();
    return summary ? summary.staleCount + summary.hiddenCount : 0;
  });
  protected readonly nextExpiry = computed(() => {
    const ends = endsLabel(this.summary()?.nextExpiry);
    return ends ? `next ${ends}` : null;
  });
}
