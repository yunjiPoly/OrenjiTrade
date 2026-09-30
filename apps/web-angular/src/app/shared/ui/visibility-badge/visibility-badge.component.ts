import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { VISIBILITY_INFO, Visibility } from '../../inventory/inventory-labels';

/**
 * Visibility of an item or binder: lock (private), globe (public), timer (temporarily public).
 * `pending` marks something set to public that nobody can see yet (hidden, expired, private binder,
 * owner not on the map); `note` explains why in the tooltip and the accessible name.
 */
@Component({
  selector: 'app-visibility-badge',
  imports: [MatIconModule, MatTooltipModule],
  template: `
    <span
      class="vis"
      [class]="'vis vis--' + tone()"
      [class.vis--labelled]="showLabel()"
      role="img"
      [attr.tabindex]="focusable() ? 0 : null"
      [attr.aria-label]="accessibleName()"
      [attr.data-visibility]="visibility()"
      [matTooltip]="tooltip()"
    >
      <mat-icon class="vis__icon" aria-hidden="true">{{ icon() }}</mat-icon>
      @if (showLabel()) {
        <span class="vis__label" aria-hidden="true">{{ text() }}</span>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .vis {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      line-height: 1.4;
      cursor: default;
    }
    .vis--labelled {
      padding: 2px var(--spacing-2) 2px 6px;
    }
    .vis__icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .vis--public {
      background: color-mix(in srgb, var(--color-accent) 14%, var(--color-surface));
      color: var(--color-accent);
    }
    .vis--temporary {
      background: color-mix(in srgb, var(--color-primary) 16%, var(--color-surface));
      color: color-mix(in srgb, var(--color-primary) 70%, var(--color-ink));
    }
    .vis--pending {
      background: color-mix(in srgb, var(--color-warning) 16%, var(--color-surface));
      color: color-mix(in srgb, var(--color-warning) 55%, var(--color-ink));
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisibilityBadgeComponent {
  readonly visibility = input.required<Visibility>();
  /** Shown to the right of the icon. */
  readonly showLabel = input(false, { transform: booleanAttribute });
  /** Overrides the default label ("Public · ends in 3 hours"). */
  readonly label = input<string | null>(null);
  /** Set to public but not visible right now. */
  readonly pending = input(false, { transform: booleanAttribute });
  /** Extra explanation for the tooltip and screen readers. */
  readonly note = input<string | null>(null);
  /** Keyboard-focusable (for the tooltip); off inside links and buttons. */
  readonly focusable = input(true, { transform: booleanAttribute });

  protected readonly info = computed(() => VISIBILITY_INFO[this.visibility()]);
  protected readonly tone = computed(() => {
    if (this.visibility() === 'PRIVATE') {
      return 'private';
    }
    if (this.pending()) {
      return 'pending';
    }
    return this.visibility() === 'PUBLIC' ? 'public' : 'temporary';
  });
  protected readonly icon = computed(() =>
    this.tone() === 'pending' ? 'visibility_off' : this.info().icon,
  );
  protected readonly text = computed(() => this.label() ?? this.info().label);
  protected readonly tooltip = computed(() =>
    [this.text(), this.note()].filter(Boolean).join(' — '),
  );
  protected readonly accessibleName = computed(() =>
    [`Visibility: ${this.text()}`, this.note()].filter(Boolean).join('. '),
  );
}
