import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SHELL_AREAS, badgeText, messagesLabel } from '../nav-links';
import { ShellIconComponent } from '../shell-icon/shell-icon.component';
import { ShellLayout } from '../shell-layout.service';
import { UnreadChats } from '../unread-chats/unread-chats';

/**
 * The bottom tab bar below 960 px (spec 16, board W29): the phone's five tabs, Home, Search,
 * Inventory, Messages (with the unread chats badge) and Profile; 64 tall plus the safe area; the
 * active tab in orange (ink in light, spec 2.6) with `aria-current="page"`.
 */
@Component({
  selector: 'app-tab-bar',
  imports: [RouterLink, ShellIconComponent],
  template: `
    <nav class="tabs" aria-label="Main">
      @for (link of areas; track link.area) {
        @let active = layout.area() === link.area;
        <a
          class="tabs__item"
          [class.tabs__item--active]="active"
          [routerLink]="link.path"
          [attr.aria-current]="active ? 'page' : null"
          [attr.aria-label]="link.area === 'messages' ? messagesName() : null"
          [attr.data-testid]="'tab-' + link.area"
        >
          <span class="tabs__icon">
            <app-shell-icon [name]="link.icon" [filled]="active" [stroke]="active ? 2 : 1.8" />
            @if (link.area === 'messages' && unread.count() > 0) {
              <span class="tabs__badge" aria-hidden="true">{{ badge() }}</span>
            }
          </span>
          <span class="tabs__label">{{ link.label }}</span>
        </a>
      }
    </nav>
  `,
  styles: `
    :host {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 100;
      display: block;
    }
    .tabs {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      height: calc(64px + env(safe-area-inset-bottom));
      padding-bottom: env(safe-area-inset-bottom);
      border-top: 1px solid var(--color-border);
      background: var(--color-surface);
    }
    .tabs__item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      min-width: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      text-decoration: none;
    }
    .tabs__item:focus-visible {
      outline-offset: -4px;
      border-radius: var(--radius-row);
    }
    .tabs__item--active {
      color: light-dark(var(--color-ink), var(--color-primary));
      font-weight: var(--font-weight-semibold);
    }
    .tabs__item--active .tabs__icon {
      color: var(--color-primary);
    }
    .tabs__icon {
      position: relative;
      display: grid;
      place-items: center;
    }
    .tabs__badge {
      position: absolute;
      top: -6px;
      right: -12px;
      display: grid;
      place-items: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: var(--color-primary);
      color: var(--color-on-primary);
      font-size: var(--font-size-tag);
      font-weight: var(--font-weight-bold);
    }
    .tabs__label {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabBarComponent {
  protected readonly layout = inject(ShellLayout);
  protected readonly unread = inject(UnreadChats);
  protected readonly areas = SHELL_AREAS;
  protected readonly badge = computed(() => badgeText(this.unread.count()));
  protected readonly messagesName = computed(() => messagesLabel(this.unread.count()));
}
