import { hasModifierKey } from '@angular/cdk/keycodes';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { ConversationSummary } from '@orenji/api-client';
import { isEditableTarget } from '../../../core/keyboard/keyboard-shortcuts.service';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { ChatDrawer } from '../../../shared/messaging/chat-drawer.service';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { CHAT_COPY } from '../data/chat-copy';
import { chatStatusLine } from '../data/deal-rules';
import { ThreadViewComponent } from '../thread/thread-view.component';

/**
 * What closes before the drawer on an Esc pressed on the page: a modal dialog (the Inventory
 * drawer at md is one), a menu that is not closing, an open list (a select's or a field's
 * suggestions) or a popover.
 */
/** A text field when an Esc reached it: its value, and whether its suggestions list was open. */
interface EscapeSnapshot {
  target: Element | null;
  value: string;
  listOpen: boolean;
}

/**
 * The state of a field an Esc may change: its text, and for a combobox whether its list is open
 * (`aria-expanded`, as Material's autocomplete and the app's own comboboxes set it).
 */
export function escapeSnapshot(target: Element | null): EscapeSnapshot {
  const value =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      ? target.value
      : (target?.textContent ?? '');
  const listOpen =
    target?.getAttribute('role') === 'combobox' && target.getAttribute('aria-expanded') === 'true';
  return { target, value, listOpen };
}

const ON_TOP = [
  '[role="dialog"][aria-modal="true"]',
  '[role="alertdialog"]',
  '.cdk-overlay-container [role="dialog"]',
  '.mat-mdc-menu-panel:not(.mat-menu-panel-exit-animation)',
  '.cdk-overlay-pane [role="listbox"]',
  '.cdk-overlay-pane.app-popover',
].join(', ');

/**
 * The chat drawer (spec 10.6, board W21): 440 wide on the right under the top bar, non-modal
 * (`aria-modal="false"`, no scrim), so the page stays usable beside it. The header (56): avatar,
 * handle, "Online · Quebec", "Open in Messages ↗" and Close; then the chat itself
 * ({@link ThreadViewComponent} in its drawer mode: the pinned card, the tip, the thread, the quick
 * replies and the composer), sharing Messages' code and its one realtime connection. Esc closes it
 * while the focus is inside (the focus goes back to the opener); F6 moves the focus between the
 * page and the drawer. At md, where it overlays the page, Esc on the page closes it too, leaving
 * the focus on the page (WC review R1-1). A lazy chunk, loaded when the first chat opens.
 */
@Component({
  selector: 'app-chat-drawer',
  imports: [RouterLink, MatIconModule, AvatarComponent, ThreadViewComponent],
  template: `
    @let c = conversation();
    <div
      class="cd"
      role="dialog"
      aria-modal="false"
      [attr.aria-labelledby]="titleId"
      tabindex="-1"
      data-testid="chat-drawer"
      (keydown.escape)="onEscape($event)"
    >
      <app-thread-view
        class="cd__thread"
        mode="drawer"
        [conversation]="c"
        [showBack]="false"
        (updated)="drawer.update($event)"
        (back)="drawer.close()"
      >
        <header drawerHeader class="cd__head">
          <span class="cd__avatar">
            <app-avatar
              size="sm"
              [src]="c.other.avatarUrl"
              [name]="c.other.displayName"
              [decorative]="true"
            />
            @if (c.other.onlineStatus === 'ONLINE') {
              <span class="cd__online" aria-hidden="true"></span>
            }
          </span>
          <span class="cd__names">
            <a class="cd__name" [id]="titleId" [routerLink]="['/collectors', c.other.handle]">{{
              c.other.handle
            }}</a>
            @if (status()) {
              <span class="cd__status">{{ status() }}</span>
            }
          </span>
          <a class="cd__open" [routerLink]="['/messages', c.id]" data-testid="open-in-messages">
            Open in Messages <span aria-hidden="true">↗</span>
          </a>
          <button
            type="button"
            class="cd__close"
            aria-label="Close the chat"
            data-testid="close-chat-drawer"
            (click)="drawer.close()"
          >
            <mat-icon aria-hidden="true">close</mat-icon>
          </button>
        </header>
      </app-thread-view>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      top: 64px;
      right: 0;
      bottom: 0;
      z-index: 900;
      display: flex;
      width: min(440px, 100vw);
    }
    .cd {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
      border-left: 1px solid var(--color-border);
      background: var(--color-background);
      box-shadow: var(--elevation-sheet);
      animation: cd-in var(--motion-duration-slow) var(--motion-easing-standard);
      outline: none;
    }
    .cd__thread {
      flex: 1 1 auto;
    }
    .cd__head {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      min-height: 56px;
      padding: 0 var(--spacing-2) 0 var(--spacing-4);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
    }
    .cd__avatar {
      position: relative;
      flex: 0 0 auto;
    }
    .cd__online {
      position: absolute;
      right: -1px;
      bottom: -1px;
      width: 11px;
      height: 11px;
      border: 2px solid var(--color-surface);
      border-radius: 50%;
      background: var(--color-online-online);
    }
    .cd__names {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
      line-height: 1.25;
    }
    .cd__name {
      overflow: hidden;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cd__name:hover {
      text-decoration: underline;
    }
    .cd__status {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .cd__open {
      flex: 0 0 auto;
      color: var(--color-accent);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .cd__open:hover {
      text-decoration: underline;
    }
    .cd__close {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--color-ink);
      cursor: pointer;
    }
    .cd__close:hover {
      background: var(--color-surface-variant);
    }
    .cd__name:focus-visible,
    .cd__open:focus-visible,
    .cd__close:focus-visible {
      border-radius: 6px;
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    @keyframes cd-in {
      from {
        transform: translateX(24px);
        opacity: 0.4;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatDrawerComponent {
  protected readonly drawer = inject(ChatDrawer);
  private readonly layout = inject(ShellLayout);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);

  readonly conversation = input.required<ConversationSummary>();

  protected readonly copy = CHAT_COPY;
  protected readonly titleId = `chat-drawer-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly status = computed(() => chatStatusLine(this.conversation(), false, false));

  constructor() {
    // A new chat: the focus moves into the composer (the opener keeps its place for Esc).
    effect(() => {
      const id = this.conversation().id;
      untracked(() => {
        if (id) {
          setTimeout(() => this.focusComposer());
        }
      });
    });
    afterNextRender(() => this.focusComposer());
    const onKey = (event: KeyboardEvent) => this.onDocumentKey(event);
    // Esc on the page: before the page's own handlers (capture), and after a text field's.
    const beforePage = (event: KeyboardEvent) => this.onPageEscape(event, true);
    const afterPage = (event: KeyboardEvent) => this.onPageEscape(event, false);
    const view = this.document.defaultView;
    this.document.addEventListener('keydown', onKey);
    this.document.addEventListener('keydown', beforePage, true);
    view?.addEventListener('keydown', afterPage);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('keydown', onKey);
      this.document.removeEventListener('keydown', beforePage, true);
      view?.removeEventListener('keydown', afterPage);
    });
  }

  protected onEscape(event: Event): void {
    // A menu or a dialog of the chat closes first (they live in overlays outside the drawer).
    if (event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    this.drawer.close();
  }

  /**
   * Esc on the page at md, where the drawer overlays it (spec 4.8), closes the drawer and leaves
   * the focus where it is: a page control under the drawer (the opener after F6, or one Tab
   * reached) shows again without the focus moving (WCAG 2.4.11; WC review R1-1). The drawer is the
   * top overlay, so it closes before the page's own Esc (the selection is cleared by the next one,
   * spec 4.9); a dialog, a menu, an open list or a popover closes first, and a text field keeps its
   * own Esc (it clears, closes its suggestions or cancels an edit): the drawer closes after it
   * only when the field left that Esc unused, and a search field with text keeps it for the
   * browser's own clear (WC review R2-1). At lg and xl the drawer pushes the page instead, so
   * nothing lies under it and Esc on the page leaves it open.
   */
  /** The text field an Esc on the page started in, as it was before any handler ran. */
  private fieldEscape: EscapeSnapshot | null = null;

  private onPageEscape(event: KeyboardEvent, beforePage: boolean): void {
    if (event.key !== 'Escape' || hasModifierKey(event) || !this.layout.medium()) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (
      this.host.nativeElement.contains(target) ||
      !!target?.closest('.cdk-overlay-pane, [role="dialog"], [role="alertdialog"]') ||
      !!this.document.querySelector(ON_TOP)
    ) {
      return;
    }
    const field = isEditableTarget(event.target);
    if (beforePage) {
      if (field) {
        this.fieldEscape = escapeSnapshot(target);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    } else if (!field) {
      return;
    } else if (event.defaultPrevented) {
      // A combobox (a Material autocomplete) may prevent every Esc, even with its list closed
      // (WC review V3-2): once its list was closed and the Esc changed nothing, the Esc was unused
      // and the drawer closes; while the list was open, that Esc closed the list.
      const before = this.fieldEscape;
      this.fieldEscape = null;
      if (!before || before.target !== target || before.listOpen) {
        return;
      }
      const state = this.drawer.state();
      setTimeout(() => {
        if (
          escapeSnapshot(target).value === before.value &&
          !escapeSnapshot(target).listOpen &&
          this.drawer.state() === state
        ) {
          this.drawer.close(false);
        }
      });
      return;
    } else if (target instanceof HTMLInputElement && target.type === 'search' && target.value) {
      // The browser clears a search field on Esc after every handler, without flagging the event
      // (WC review R2-1): that Esc is the field's, and the drawer closes only when it left the
      // text as it was (an engine without that clear).
      const value = target.value;
      const state = this.drawer.state();
      setTimeout(() => {
        if (target.value === value && this.drawer.state() === state) {
          this.drawer.close(false);
        }
      });
      return;
    }
    this.drawer.close(false);
  }

  /** F6: from the page into the drawer, and back to the page (spec 10.6). */
  private onDocumentKey(event: KeyboardEvent): void {
    if (event.key !== 'F6' || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    event.preventDefault();
    const element = this.host.nativeElement;
    if (element.contains(this.document.activeElement)) {
      const opener = this.drawer.state()?.opener;
      const target = opener?.isConnected ? opener : this.document.getElementById('main-content');
      target?.focus();
    } else {
      this.focusComposer();
    }
  }

  private focusComposer(): void {
    const element = this.host.nativeElement;
    const field = element.querySelector<HTMLTextAreaElement>('textarea:not([readonly])');
    (field ?? element.querySelector<HTMLElement>('[role="dialog"]'))?.focus();
  }
}
