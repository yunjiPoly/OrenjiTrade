import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Page title row. Project buttons with the `actions` attribute; anything else
 * (tabs, segmented controls, filters) is rendered underneath.
 */
@Component({
  selector: 'app-page-header',
  template: `
    <header class="page-header">
      <div class="page-header__row">
        <div class="page-header__text">
          <h1 class="page-header__title">{{ title() }}</h1>
          @if (subtitle()) {
            <p class="page-header__subtitle">{{ subtitle() }}</p>
          }
        </div>
        <div class="page-header__actions">
          <ng-content select="[actions]" />
        </div>
      </div>
      <div class="page-header__extra">
        <ng-content />
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--spacing-6);
    }
    .page-header__row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-3) var(--spacing-4);
    }
    .page-header__title {
      font-size: var(--font-size-3xl);
    }
    .page-header__subtitle {
      margin: var(--spacing-1) 0 0;
      color: var(--color-text-muted);
    }
    .page-header__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
    }
    .page-header__actions:empty,
    .page-header__extra:empty {
      display: none;
    }
    .page-header__extra {
      margin-top: var(--spacing-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
