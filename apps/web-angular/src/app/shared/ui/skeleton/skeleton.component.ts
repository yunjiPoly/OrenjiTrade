import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  numberAttribute,
} from '@angular/core';

export type SkeletonVariant = 'block' | 'list' | 'card';

/**
 * Loading placeholder. `block` is a single bar (size it with `width`/`height`),
 * `list` renders `lines` rows with an avatar, `card` mimics a media card.
 * Hidden from assistive technology; announce loading on the container instead.
 * The shimmer stops under `prefers-reduced-motion`.
 */
@Component({
  selector: 'app-skeleton',
  template: `
    @switch (variant()) {
      @case ('list') {
        <div class="skeleton skeleton--list">
          @for (row of rows(); track row) {
            <div class="skeleton__row">
              <span class="skeleton__bone skeleton__avatar"></span>
              <span class="skeleton__lines">
                <span class="skeleton__bone skeleton__line"></span>
                <span class="skeleton__bone skeleton__line skeleton__line--short"></span>
              </span>
            </div>
          }
        </div>
      }
      @case ('card') {
        <div class="skeleton skeleton--card">
          <span class="skeleton__bone skeleton__media"></span>
          <span class="skeleton__bone skeleton__line"></span>
          <span class="skeleton__bone skeleton__line skeleton__line--short"></span>
        </div>
      }
      @default {
        <span
          class="skeleton skeleton__bone skeleton--block"
          [style.width]="width()"
          [style.height]="height()"
        ></span>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .skeleton__bone {
      display: block;
      border-radius: var(--radius-sm);
      background: linear-gradient(
        90deg,
        var(--color-surface-variant) 0%,
        var(--color-border) 50%,
        var(--color-surface-variant) 100%
      );
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.4s ease-in-out infinite;
    }
    .skeleton--block {
      width: 100%;
      height: 1em;
    }
    .skeleton__row {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-2) 0;
    }
    .skeleton__avatar {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-pill);
      flex: 0 0 auto;
    }
    .skeleton__lines {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: var(--spacing-2);
    }
    .skeleton__line {
      height: 0.9em;
      width: 100%;
    }
    .skeleton__line--short {
      width: 55%;
    }
    .skeleton--card {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
    }
    .skeleton__media {
      aspect-ratio: 5 / 7;
      width: 100%;
      border-radius: var(--radius-md);
    }
    @keyframes skeleton-shimmer {
      from {
        background-position: 200% 0;
      }
      to {
        background-position: -200% 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .skeleton__bone {
        animation: none;
        background: var(--color-surface-variant);
      }
    }
  `,
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonComponent {
  readonly variant = input<SkeletonVariant>('block');
  readonly lines = input(3, { transform: numberAttribute });
  readonly width = input<string | null>(null);
  readonly height = input<string | null>(null);

  protected readonly rows = computed(() =>
    Array.from({ length: Math.max(1, this.lines()) }, (_, index) => index),
  );
}
