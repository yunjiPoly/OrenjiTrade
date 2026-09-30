import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Read-only five-star score with partial fill ("4.5 out of 5"). Announced as one image; the
 * stars themselves are decorative.
 */
@Component({
  selector: 'app-star-rating',
  template: `
    <span class="stars" [attr.data-size]="size()" role="img" [attr.aria-label]="label()">
      @for (fill of fills(); track $index) {
        <span class="star" aria-hidden="true">
          <span class="star__base">★</span>
          <span class="star__fill" [style.width.%]="fill">★</span>
        </span>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      vertical-align: middle;
    }
    .stars {
      display: inline-flex;
      gap: 1px;
      line-height: 1;
      font-size: 16px;
    }
    .stars[data-size='sm'] {
      font-size: 13px;
    }
    .stars[data-size='lg'] {
      font-size: 24px;
    }
    .star {
      position: relative;
      display: inline-block;
    }
    .star__base {
      color: color-mix(in srgb, var(--color-text-muted) 35%, transparent);
    }
    .star__fill {
      position: absolute;
      inset: 0 auto 0 0;
      overflow: hidden;
      color: var(--color-warning);
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StarRatingComponent {
  /** Score between 0 and 5 (`null` shows five empty stars). */
  readonly value = input<number | null | undefined>(null);
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  protected readonly fills = computed(() => {
    const value = Math.max(0, Math.min(5, this.value() ?? 0));
    return [0, 1, 2, 3, 4].map((index) =>
      Math.round(Math.max(0, Math.min(1, value - index)) * 100),
    );
  });
  protected readonly label = computed(() => {
    const value = this.value();
    return value === null || value === undefined
      ? 'Not rated'
      : `${Number.isInteger(value) ? value : value.toFixed(1)} out of 5 stars`;
  });
}
