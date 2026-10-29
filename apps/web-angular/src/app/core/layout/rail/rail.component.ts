import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../auth/session.service';
import { KeyboardShortcuts } from '../../keyboard/keyboard-shortcuts.service';
import { SHELL_AREAS, badgeText, messagesLabel } from '../nav-links';
import { ShellIconComponent } from '../shell-icon/shell-icon.component';
import { ShellLayout } from '../shell-layout.service';
import { UnreadChats } from '../unread-chats/unread-chats';

/**
 * The rail (72, spec 4.6, board W1): Home, Search, Inventory, Messages and Profile in the phone's
 * order, each a 24 px icon over an 11/500 label; the active one with a `primaryTint` pill, a
 * filled orange icon and `aria-current="page"` (light: a `primaryContainer` pill in ink, spec
 * 2.6); the Messages badge counts unread chats; at the bottom, Admin for staff and the "?" button
 * of Keyboard shortcuts. Tooltips name the shortcut ("Search · g s"). Guests get the same rail.
 */
@Component({
  selector: 'app-rail',
  imports: [RouterLink, MatTooltipModule, ShellIconComponent],
  template: `
    <nav class="rail" aria-label="Main">
      <div class="rail__items">
        @for (link of areas; track link.area) {
          @let active = layout.area() === link.area;
          <a
            class="rail__item"
            [class.rail__item--active]="active"
            [routerLink]="link.path"
            [attr.aria-current]="active ? 'page' : null"
            [attr.aria-label]="link.area === 'messages' ? messagesName() : null"
            [matTooltip]="link.label + ' · g ' + link.key"
            matTooltipPosition="right"
            [attr.data-testid]="'rail-' + link.area"
          >
            <span class="rail__pill">
              <app-shell-icon [name]="link.icon" [filled]="active" [stroke]="active ? 2 : 1.8" />
              @if (link.area === 'messages' && unread.count() > 0) {
                <span class="rail__badge" aria-hidden="true" data-testid="messages-badge">{{
                  badge()
                }}</span>
              }
            </span>
            <span class="rail__label">{{ link.label }}</span>
          </a>
        }
      </div>
      <div class="rail__bottom">
        @if (session.canAccessAdmin()) {
          @let adminActive = layout.area() === 'admin';
          <a
            class="rail__item rail__item--admin"
            [class.rail__item--active]="adminActive"
            routerLink="/admin"
            [attr.aria-current]="adminActive ? 'page' : null"
            matTooltip="Admin console"
            matTooltipPosition="right"
            data-testid="rail-admin"
          >
            <span class="rail__pill"
              ><app-shell-icon
                name="shield"
                [filled]="adminActive"
                [stroke]="adminActive ? 2 : 1.8"
            /></span>
            <span class="rail__label">Admin</span>
          </a>
        }
        <button
          type="button"
          class="rail__help"
          [class.rail__help--open]="shortcuts.helpOpen()"
          aria-label="Keyboard shortcuts"
          aria-haspopup="dialog"
          matTooltip="Keyboard shortcuts · ?"
          matTooltipPosition="right"
          data-testid="rail-help"
          (click)="shortcuts.openHelp()"
        >
          ?
        </button>
      </div>
    </nav>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .rail {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: var(--spacing-2);
      height: 100%;
      padding: 8px 0;
    }
    .rail__items,
    .rail__bottom {
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
    .rail__bottom {
      align-items: center;
      gap: var(--spacing-2);
      padding-bottom: 8px;
    }
    .rail__item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      width: 72px;
      height: 64px;
      color: var(--color-text-muted);
      font-size: var(--font-size-tag);
      font-weight: var(--font-weight-medium);
      line-height: 14px;
      text-decoration: none;
    }
    .rail__item:focus-visible {
      outline-offset: -4px;
      border-radius: var(--radius-row);
    }
    .rail__pill {
      position: relative;
      display: grid;
      place-items: center;
      width: 48px;
      height: 32px;
      border-radius: 16px;
      transition: background var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .rail__item:hover {
      color: var(--color-ink);
    }
    .rail__item:hover .rail__pill {
      background: var(--color-primary-tint-subtle);
    }
    /* Dark: orange on primaryTint. Light: orange 11 px text fails AA, so the active item is ink
       on a primaryContainer pill (spec 2.6). light-dark() follows the tokens' color-scheme. */
    .rail__item--active,
    .rail__item--active:hover {
      color: light-dark(var(--color-ink), var(--color-primary));
      font-weight: var(--font-weight-bold);
    }
    .rail__item--active .rail__pill,
    .rail__item--active:hover .rail__pill {
      background: light-dark(var(--color-primary-container), var(--color-primary-tint));
    }
    @media (forced-colors: active) {
      .rail__item--active .rail__pill {
        outline: 2px solid Highlight;
        outline-offset: -2px;
      }
    }
    .rail__badge {
      position: absolute;
      top: -2px;
      right: 2px;
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
      line-height: 1;
    }
    .rail__help {
      width: 40px;
      height: 40px;
      border: 1px solid var(--color-border-input);
      border-radius: 20px;
      background: none;
      color: var(--color-text-muted);
      font: inherit;
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .rail__help:hover {
      color: var(--color-ink);
      border-color: var(--color-border-strong);
    }
    .rail__help--open {
      border-color: var(--color-primary);
      background: var(--color-primary-tint);
      color: var(--color-primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RailComponent {
  protected readonly layout = inject(ShellLayout);
  protected readonly session = inject(SessionService);
  protected readonly shortcuts = inject(KeyboardShortcuts);
  protected readonly unread = inject(UnreadChats);
  protected readonly areas = SHELL_AREAS;
  protected readonly badge = computed(() => badgeText(this.unread.count()));
  protected readonly messagesName = computed(() => messagesLabel(this.unread.count()));
}
