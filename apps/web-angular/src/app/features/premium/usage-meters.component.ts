import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { UsageRow } from './usage-meters';

/** The member's usage of each plan limit, with bars and reset times. */
@Component({
  selector: 'app-usage-meters',
  imports: [DatePipe, MatIconModule, RelativeTimePipe],
  template: `
    <ul class="usage" aria-label="Your plan usage">
      @for (row of rows(); track row.key) {
        <li class="usage__item" [attr.data-limit]="row.key">
          <span class="usage__label">
            {{ row.label }}
            @if (row.boosted) {
              <span class="usage__boost" title="Boosted for your account">
                <mat-icon aria-hidden="true">bolt</mat-icon>
                Boosted
              </span>
            }
          </span>
          <span class="usage__value" data-testid="usage-value">{{ row.value }}</span>
          @if (row.percent !== null) {
            <span
              class="usage__bar"
              role="meter"
              aria-valuemin="0"
              aria-valuemax="100"
              [attr.aria-valuenow]="row.percent"
              [attr.aria-label]="row.label + ' used'"
            >
              <span
                class="usage__fill"
                [class.usage__fill--full]="row.full"
                [style.width.%]="row.percent"
              ></span>
            </span>
          }
          @if (row.resetsAt) {
            <span class="usage__reset">
              Resets {{ row.resetsAt | relativeTime }} ({{ row.resetsAt | date: 'short' }})
            </span>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .usage {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: var(--spacing-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .usage__item {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--spacing-1) var(--spacing-2);
      padding: var(--spacing-3) var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .usage__label {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-1);
      font-size: var(--font-size-sm);
    }
    .usage__boost {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 0 6px;
      border-radius: var(--radius-pill);
      background: var(--color-accent-container);
      color: var(--color-on-accent-container);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .usage__boost mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }
    .usage__value {
      font-weight: var(--font-weight-semibold);
      font-variant-numeric: tabular-nums;
    }
    .usage__bar {
      flex: 1 0 100%;
      height: 6px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      overflow: hidden;
    }
    .usage__fill {
      display: block;
      height: 100%;
      background: var(--color-primary);
      transition: width var(--motion-duration-base) var(--motion-easing-standard);
    }
    .usage__fill--full {
      background: var(--color-danger);
    }
    .usage__reset {
      flex: 1 0 100%;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageMetersComponent {
  readonly rows = input.required<readonly UsageRow[]>();
}
