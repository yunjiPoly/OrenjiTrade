import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { VisibilityTagKind } from '../data/visibility-status';

/**
 * Who can see a card (spec 9.4, the phone's tag): Private in muted text on the raised surface,
 * Public in teal on a faint teal, and a public card nobody sees yet in amber. Every pair passes AA
 * in both themes (`inventory-contrast.spec.ts`).
 */
@Component({
  selector: 'app-visibility-tag',
  imports: [MatIconModule],
  template: `<mat-icon aria-hidden="true">{{ icon() }}</mat-icon
    ><span>{{ label() }}</span>`,
  host: {
    class: 'vtag',
    '[class.vtag--public]': "kind() === 'public'",
    '[class.vtag--pending]': "kind() === 'pending'",
  },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      height: 20px;
      padding: 0 6px;
      border-radius: 6px;
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
      font-size: var(--font-size-tag);
      font-weight: var(--font-weight-semibold);
      line-height: 1;
      white-space: nowrap;
    }
    :host(.vtag--public) {
      background: light-dark(
        color-mix(in srgb, var(--color-accent) 10%, var(--color-surface)),
        color-mix(in srgb, var(--color-accent) 14%, var(--color-surface))
      );
      color: light-dark(
        color-mix(in srgb, var(--color-accent) 85%, var(--color-ink)),
        var(--color-accent)
      );
    }
    :host(.vtag--pending) {
      background: light-dark(
        color-mix(in srgb, var(--color-warning) 22%, var(--color-surface)),
        color-mix(in srgb, var(--color-warning) 14%, var(--color-surface))
      );
      color: light-dark(
        color-mix(in srgb, var(--color-warning) 60%, var(--color-ink)),
        var(--color-warning)
      );
    }
    mat-icon {
      width: 12px;
      height: 12px;
      font-size: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisibilityTagComponent {
  readonly kind = input.required<VisibilityTagKind>();
  readonly label = input.required<string>();
  readonly icon = input<string>('lock');
}
