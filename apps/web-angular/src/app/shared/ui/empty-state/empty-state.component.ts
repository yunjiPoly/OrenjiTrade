import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Empty state: icon, title, description and an optional action slot
 * (`<button actions ...>` projected into the footer).
 */
@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule],
  template: `
    <div class="empty-state">
      <mat-icon class="empty-state__icon" aria-hidden="true">{{ icon() }}</mat-icon>
      @switch (level()) {
        @case (1) {
          <h1 class="empty-state__title">{{ title() }}</h1>
        }
        @case (3) {
          <h3 class="empty-state__title">{{ title() }}</h3>
        }
        @default {
          <h2 class="empty-state__title">{{ title() }}</h2>
        }
      }
      @if (description()) {
        <p class="empty-state__description">{{ description() }}</p>
      }
      <div class="empty-state__actions">
        <ng-content select="[actions]" />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--spacing-2);
      padding: var(--spacing-10) var(--spacing-4);
      color: var(--color-text-muted);
    }
    .empty-state__icon {
      width: 48px;
      height: 48px;
      font-size: 48px;
      color: var(--color-primary);
      opacity: 0.85;
    }
    .empty-state__title {
      font-size: var(--font-size-xl);
      color: var(--color-ink);
    }
    .empty-state__description {
      max-width: 44ch;
      margin: 0;
    }
    .empty-state__actions {
      display: flex;
      gap: var(--spacing-2);
      margin-top: var(--spacing-3);
    }
    .empty-state__actions:empty {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly description = input('');
  /** The title's heading level: 2 inside a page, 1 when the state is the page, 3 in a section. */
  readonly level = input<1 | 2 | 3>(2);
}
