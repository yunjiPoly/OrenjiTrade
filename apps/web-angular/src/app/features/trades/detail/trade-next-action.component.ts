import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { NextActionView } from '../../../shared/offers/trade-labels';

/**
 * The trade page's next-action banner: what happens now and who acts (from `nextAction`), with
 * the operations projected as buttons (`[actions]`).
 */
@Component({
  selector: 'app-trade-next-action',
  imports: [MatIconModule],
  template: `
    @let v = view();
    <section
      class="na"
      [attr.data-tone]="v.tone"
      aria-labelledby="na-title"
      data-testid="next-action"
    >
      <span class="na__icon" aria-hidden="true"
        ><mat-icon>{{ v.icon }}</mat-icon></span
      >
      <div class="na__text">
        <h2 id="na-title" class="na__title">{{ v.title }}</h2>
        <p class="na__description">{{ v.description }}</p>
      </div>
      <div class="na__actions">
        <ng-content select="[actions]" />
      </div>
    </section>
  `,
  styles: `
    .na {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--spacing-3) var(--spacing-4);
      padding: var(--spacing-4) var(--spacing-5);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      animation: na-in var(--motion-duration-base) var(--motion-easing-standard);
    }
    .na[data-tone='live'] {
      border-color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
      box-shadow: var(--elevation-floating);
    }
    .na[data-tone='success'] {
      border-color: color-mix(in srgb, var(--color-success) 50%, var(--color-border));
      background: color-mix(in srgb, var(--color-success) 10%, var(--color-surface));
    }
    .na[data-tone='info'] {
      background: color-mix(in srgb, var(--color-info) 8%, var(--color-surface));
    }
    .na__icon {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    .na[data-tone='live'] .na__icon {
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .na[data-tone='success'] .na__icon {
      background: var(--color-success);
      color: #fff;
    }
    .na[data-tone='info'] .na__icon {
      color: var(--color-info);
    }
    .na__title {
      margin: 0;
      font-size: var(--font-size-lg);
    }
    .na__description {
      margin: var(--spacing-1) 0 0;
      color: var(--color-text-muted);
    }
    .na__actions {
      display: flex;
      flex-wrap: wrap;
      grid-column: 2;
      gap: var(--spacing-2);
    }
    .na__actions:empty {
      display: none;
    }
    @keyframes na-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .na {
        animation: none;
      }
    }
    @media (max-width: 599px) {
      .na {
        grid-template-columns: minmax(0, 1fr);
        padding: var(--spacing-4);
      }
      .na__actions {
        grid-column: 1;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradeNextActionComponent {
  readonly view = input.required<NextActionView>();
}
