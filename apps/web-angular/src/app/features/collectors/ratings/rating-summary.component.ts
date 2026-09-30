import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { RatingSummaryResponse } from '@orenji/api-client';
import {
  RATING_CRITERIA,
  formatAverage,
  ratingCountLabel,
} from '../../../shared/ratings/rating-labels';
import { StarRatingComponent } from '../../../shared/ratings/star-rating.component';

/**
 * Rating summary of a collector: the average with stars and the count, and one bar per optional
 * criterion (communication, card condition, shipping, meetup reliability; "—" when nobody scored
 * it yet).
 */
@Component({
  selector: 'app-rating-summary',
  imports: [StarRatingComponent],
  template: `
    @let s = summary();
    <div class="summary" data-testid="rating-summary">
      <div class="summary__score">
        <span class="summary__average" data-testid="rating-average">{{ average() }}</span>
        <app-star-rating [value]="s?.average ?? null" size="lg" />
        <span class="summary__count" data-testid="rating-count">{{ count() }}</span>
      </div>
      <dl class="summary__breakdown" aria-label="Rating breakdown">
        @for (row of rows(); track row.key) {
          <div class="bar">
            <dt class="bar__label">{{ row.label }}</dt>
            <dd class="bar__value">
              <span class="bar__track" aria-hidden="true">
                <span class="bar__fill" [style.width.%]="row.percent"></span>
              </span>
              <span class="bar__number">{{ row.text }}</span>
            </dd>
          </div>
        }
      </dl>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .summary {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    .summary__score {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-1);
    }
    .summary__average {
      font-family: var(--font-display);
      font-size: var(--font-size-4xl);
      font-weight: var(--font-weight-bold);
      line-height: 1;
      color: var(--color-ink);
    }
    .summary__count {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .summary__breakdown {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: 0;
    }
    .bar {
      display: grid;
      grid-template-columns: minmax(110px, auto) 1fr;
      align-items: center;
      gap: var(--spacing-2);
    }
    .bar__label {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .bar__value {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
    }
    .bar__track {
      flex: 1 1 auto;
      height: 6px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      overflow: hidden;
    }
    .bar__fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--color-warning);
      transition: width var(--motion-duration-slow) var(--motion-easing-standard);
    }
    .bar__number {
      min-width: 2.2em;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      text-align: right;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RatingSummaryComponent {
  readonly summary = input<RatingSummaryResponse | null>(null);

  protected readonly average = computed(() => formatAverage(this.summary()?.average));
  protected readonly count = computed(() => ratingCountLabel(this.summary()?.count));
  protected readonly rows = computed(() => {
    const summary = this.summary();
    return RATING_CRITERIA.map((criterion) => {
      const value = summary?.[criterion.key];
      const known = typeof value === 'number';
      return {
        key: criterion.key,
        label: criterion.label,
        percent: known ? Math.round((value / 5) * 100) : 0,
        text: known ? value.toFixed(1) : '—',
      };
    });
  });
}
