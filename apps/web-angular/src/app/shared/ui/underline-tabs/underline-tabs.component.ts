import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** One tab: a link that changes the page's view (the URL keeps it). */
export interface UnderlineTab {
  id: string;
  label: string;
  commands: unknown[];
  queryParams?: Record<string, string | null>;
  active: boolean;
  /** A small orange dot after the label (Chats with unread chats). */
  dot?: boolean;
  dotLabel?: string;
}

/**
 * Underline tabs (spec 2.4): 44 tall, a 2 px orange underline on the active tab (Search,
 * Messages, Inventory). Each tab is a link, so the view lives in the URL; the active one carries
 * `aria-current="page"`.
 */
@Component({
  selector: 'app-underline-tabs',
  imports: [RouterLink],
  template: `
    <nav class="tabs" [attr.aria-label]="label()">
      @for (tab of tabs(); track tab.id) {
        <a
          class="tabs__tab"
          [class.tabs__tab--active]="tab.active"
          [routerLink]="tab.commands"
          [queryParams]="tab.queryParams ?? {}"
          [attr.aria-current]="tab.active ? 'page' : null"
          [attr.data-testid]="'tab-link-' + tab.id"
        >
          {{ tab.label }}
          @if (tab.dot) {
            <span class="tabs__dot" aria-hidden="true"></span>
            @if (tab.dotLabel) {
              <span class="visually-hidden">{{ tab.dotLabel }}</span>
            }
          }
        </a>
      }
    </nav>
  `,
  styles: `
    :host {
      display: block;
    }
    .tabs {
      display: flex;
      gap: var(--spacing-6);
      border-bottom: 1px solid var(--color-border);
    }
    .tabs__tab {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 44px;
      color: var(--color-text-muted);
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .tabs__tab:hover {
      color: var(--color-ink);
    }
    .tabs__tab--active {
      color: var(--color-ink);
    }
    .tabs__tab--active::after {
      position: absolute;
      right: 0;
      bottom: -1px;
      left: 0;
      height: 2px;
      border-radius: 2px;
      background: var(--color-primary);
      content: '';
    }
    .tabs__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnderlineTabsComponent {
  readonly label = input.required<string>();
  readonly tabs = input.required<readonly UnderlineTab[]>();
}
