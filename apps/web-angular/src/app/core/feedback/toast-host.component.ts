import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
} from '@angular/core';
import { ShellIconComponent } from '../layout/shell-icon/shell-icon.component';
import { ShellLayout } from '../layout/shell-layout.service';
import { ToastService } from './toast.service';

/**
 * The toast stack of the shell (spec 4.8): bottom-left, 24 px from the rail and the bottom edge
 * (above the tab bar below 960), at most 400 wide, newest at the bottom. The stack is a polite
 * live region, each toast a `status` (an error toast an alert); the timers pause while the pointer
 * or the focus is on a toast.
 *
 * The host moves to the end of `<body>` and carries `aria-live`: a CDK dialog or drawer hides
 * every other child of `<body>` from assistive technology while it is open, except live regions,
 * so a toast raised from a dialog is still announced. Closing a focused toast moves the focus to
 * the next toast, else back to where it was before the toasts, else to the main content.
 */
@Component({
  selector: 'app-toast-host',
  imports: [ShellIconComponent],
  template: `
    <div
      class="toasts"
      (mouseenter)="service.pause()"
      (mouseleave)="service.resume()"
      (focusin)="onFocusIn($event)"
      (focusout)="onFocusOut($event)"
    >
      @for (toast of service.toasts(); track toast.id) {
        <div
          class="toast"
          [class.toast--error]="toast.tone === 'error'"
          [attr.role]="toast.tone === 'error' ? 'alert' : 'status'"
          data-testid="toast"
        >
          <app-shell-icon
            class="toast__icon"
            [name]="
              toast.tone === 'error' ? 'alert' : toast.tone === 'info' ? 'info' : 'checkCircle'
            "
            [size]="20"
          />
          <div class="toast__text">
            <p class="toast__title">{{ toast.title }}</p>
            @if (toast.sub) {
              <p class="toast__sub">{{ toast.sub }}</p>
            }
          </div>
          @if (toast.action) {
            <button type="button" class="toast__action" (click)="act(toast.id, $event)">
              {{ toast.action }}
            </button>
          }
          <button
            type="button"
            class="toast__close"
            aria-label="Close"
            (click)="close(toast.id, $event)"
          >
            <app-shell-icon name="close" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      z-index: 1100;
      left: calc(72px + 24px);
      bottom: 24px;
      width: min(400px, calc(100vw - 72px - 48px));
      pointer-events: none;
    }
    .toasts {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
    }
    .toast {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-3);
      padding: 14px 8px 14px 16px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-row);
      background: var(--color-surface-elevated);
      box-shadow: var(--elevation-menu);
      color: var(--color-ink);
      pointer-events: auto;
      animation: toast-in var(--motion-duration-base) var(--motion-easing-standard);
    }
    .toast__icon {
      margin-top: 1px;
      color: var(--color-success);
    }
    .toast--error .toast__icon {
      color: var(--color-warning);
    }
    .toast__text {
      flex: 1 1 auto;
      min-width: 0;
    }
    .toast__title {
      margin: 0;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      line-height: 20px;
    }
    .toast__sub {
      margin: 2px 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
      line-height: 18px;
    }
    .toast__action,
    .toast__close {
      flex: none;
      height: 32px;
      border: 0;
      border-radius: var(--radius-pill);
      background: transparent;
      cursor: pointer;
    }
    .toast__action {
      padding: 0 10px;
      color: var(--color-accent);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .toast__close {
      display: grid;
      place-items: center;
      width: 32px;
      color: var(--color-text-muted);
    }
    .toast__action:hover,
    .toast__close:hover {
      background: var(--color-surface-variant);
    }
    @keyframes toast-in {
      from {
        transform: translateY(8px);
        opacity: 0;
      }
    }
    /*
     * On Messages the toasts stay inside the inbox column (340 at lg, 300 at md), off the chat's
     * "+" and field (WC review U11).
     */
    :host(.toasts-host--inbox) {
      width: min(292px, calc(100vw - 72px - 48px));
    }
    @media (max-width: 1279.98px) {
      :host(.toasts-host--inbox) {
        width: 252px;
      }
    }
    /* Above a list pane's bulk dock (Search › Wishlist), never over its button (WD review U15). */
    /* Above a bulk dock: its measured top plus a gap (ShellLayout.dockLift). */
    :host(.toasts-host--dock) {
      bottom: max(24px, var(--toasts-dock-lift, 96px));
    }
    @media (max-width: 959.98px) {
      :host,
      :host(.toasts-host--inbox) {
        left: 16px;
        right: 16px;
        width: auto;
        bottom: calc(64px + env(safe-area-inset-bottom) + 12px);
      }
      :host(.toasts-host--dock) {
        bottom: max(
          calc(64px + env(safe-area-inset-bottom) + 12px),
          var(--toasts-dock-lift, calc(64px + env(safe-area-inset-bottom) + 96px))
        );
      }
      /* A chat above the tabs: under its header, off the composer. */
      :host(.toasts-host--chat) {
        top: 76px;
        bottom: auto;
      }
    }
  `,
  host: {
    'aria-live': 'polite',
    'aria-relevant': 'additions',
    '[class.toasts-host--inbox]': "layout.area() === 'messages' && !layout.narrow()",
    '[class.toasts-host--chat]': 'layout.inChat()',
    '[class.toasts-host--dock]': 'layout.dockOpen()',
    '[style.--toasts-dock-lift]': "layout.dockOpen() ? layout.dockLift() + 'px' : null",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHostComponent {
  protected readonly service = inject(ToastService);
  protected readonly layout = inject(ShellLayout);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  /** Where the focus was before it entered the toasts. */
  private returnFocus: HTMLElement | null = null;

  constructor() {
    afterNextRender(() => {
      const element = this.host.nativeElement;
      if (element.parentElement !== this.document.body) {
        this.document.body.appendChild(element);
      }
    });
    inject(DestroyRef).onDestroy(() => this.host.nativeElement.remove());
  }

  protected onFocusIn(event: FocusEvent): void {
    const from = event.relatedTarget as HTMLElement | null;
    if (from && !this.host.nativeElement.contains(from)) {
      this.returnFocus = from;
    }
    this.service.pause();
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !(event.currentTarget as HTMLElement).contains(next)) {
      this.service.resume();
    }
  }

  protected act(id: number, event: Event): void {
    const index = this.focusedIndex(event);
    this.service.act(id);
    this.refocus(index);
  }

  protected close(id: number, event: Event): void {
    const index = this.focusedIndex(event);
    this.service.close(id, false);
    this.refocus(index);
  }

  /** The index of the toast whose button had the focus, or -1 (a pointer click elsewhere). */
  private focusedIndex(event: Event): number {
    const button = event.currentTarget as HTMLElement | null;
    if (!button || this.document.activeElement !== button) {
      return -1;
    }
    const toasts = Array.from(this.host.nativeElement.querySelectorAll('.toast'));
    return toasts.findIndex((toast) => toast.contains(button));
  }

  private refocus(index: number): void {
    if (index < 0) {
      return;
    }
    // After the closed toast left the DOM.
    setTimeout(() => {
      const closes = this.host.nativeElement.querySelectorAll<HTMLElement>('.toast__close');
      const next = closes[Math.min(index, closes.length - 1)];
      const back = this.returnFocus?.isConnected ? this.returnFocus : null;
      const target =
        next ?? back ?? this.document.getElementById('main-content') ?? this.document.body;
      target.focus();
      if (!next) {
        this.returnFocus = null;
      }
    });
  }
}
