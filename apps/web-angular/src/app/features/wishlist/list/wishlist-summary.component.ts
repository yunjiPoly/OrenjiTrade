import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { WishUsage } from '../data/wishlist.store';

/**
 * The wishlist at a glance: the number of wishes and how many fit (`wishlist.items.max`, the same
 * limit for every collector) as a meter. No matches any more (stage S2); nothing to buy (stage
 * F1).
 */
@Component({
  selector: 'app-wishlist-summary',
  template: `
    <section class="ws" aria-label="Wishlist summary">
      <dl class="ws__stats">
        <div class="ws__stat">
          <dt>Wishes</dt>
          <dd data-testid="wishlist-count">{{ count() }}</dd>
        </div>
      </dl>
      @if (usage(); as usage) {
        <div class="ws__usage">
          <p class="ws__usage-text">
            @if (usage.limit !== null) {
              {{ usage.used }} of {{ usage.limit }} wishes
            } @else {
              {{ usage.used }} wishes · unlimited
            }
          </p>
          @if (percent() !== null) {
            <div
              class="ws__meter"
              role="meter"
              aria-label="Wishlist usage"
              [attr.aria-valuenow]="usage.used"
              aria-valuemin="0"
              [attr.aria-valuemax]="usage.limit"
            >
              <span
                class="ws__fill"
                [class.ws__fill--full]="full()"
                [style.width.%]="percent()"
              ></span>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .ws {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-4);
      padding: var(--spacing-4) var(--spacing-5);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background:
        radial-gradient(
          circle at 100% 0,
          color-mix(in srgb, var(--color-primary) 12%, transparent),
          transparent 55%
        ),
        var(--color-surface);
    }
    .ws__stats {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-6);
      margin: 0;
    }
    .ws__stat {
      display: flex;
      flex-direction: column-reverse;
    }
    .ws__stat dt {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .ws__stat dd {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-2xl);
      font-weight: var(--font-weight-bold);
    }
    .ws__usage {
      display: flex;
      flex: 0 1 280px;
      flex-direction: column;
      gap: var(--spacing-1);
      min-width: 200px;
    }
    .ws__usage-text {
      display: flex;
      justify-content: space-between;
      gap: var(--spacing-2);
      margin: 0;
      font-size: var(--font-size-sm);
    }
    .ws__meter {
      height: 8px;
      overflow: hidden;
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
    }
    .ws__fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--color-accent);
      transition: width var(--motion-duration-base) var(--motion-easing-standard);
    }
    .ws__fill--full {
      background: var(--color-warning);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishlistSummaryComponent {
  readonly count = input(0);
  readonly usage = input<WishUsage | null>(null);

  protected readonly percent = computed(() => {
    const usage = this.usage();
    if (!usage || usage.limit === null || usage.limit <= 0) {
      return null;
    }
    return Math.min(100, Math.round((usage.used / usage.limit) * 100));
  });
  /** At least 80 % of the wishes that fit are used. */
  protected readonly full = computed(() => (this.percent() ?? 0) >= 80);
}
