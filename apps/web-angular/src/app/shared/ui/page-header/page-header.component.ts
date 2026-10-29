import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
} from '@angular/core';
import { ShellLayout } from '../../../core/layout/shell-layout.service';

/**
 * Page title row. Project buttons with the `actions` attribute; anything else
 * (tabs, segmented controls, filters) is rendered underneath. On a tab's own page (`tabTitle`),
 * the title steps back below 960 while the top bar shows it as the phone's per-tab bar (spec 16):
 * visually hidden, still the page's h1.
 */
@Component({
  selector: 'app-page-header',
  template: `
    <header class="page-header">
      <div class="page-header__row">
        <div class="page-header__text">
          @if (level() === 2) {
            <h2 class="page-header__title">{{ title() }}</h2>
          } @else {
            <h1 class="page-header__title" [class.visually-hidden]="titleInBar()">{{ title() }}</h1>
          }
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
  /** 2 when the page is a section of another page (a tab of Search, say): one h1 per page. */
  readonly level = input<1 | 2>(1);
  /** The page is a tab's own page whose title the top bar shows below 960 (spec 16). */
  readonly tabTitle = input(false, { transform: booleanAttribute });

  private readonly layout = inject(ShellLayout);
  protected readonly titleInBar = computed(
    () => this.tabTitle() && this.layout.tabTitle() !== null,
  );
}
