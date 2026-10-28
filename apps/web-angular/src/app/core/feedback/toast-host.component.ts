import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ShellIconComponent } from '../layout/shell-icon/shell-icon.component';
import { ToastService } from './toast.service';

/**
 * The toast stack of the shell (spec 4.8): bottom-left, 24 px from the rail and the bottom edge
 * (above the tab bar below 960), at most 400 wide, newest at the bottom. The stack is a polite
 * live region (`role=status`), an error toast an alert; the timers pause while the pointer or the focus is
 * on a toast.
 */
@Component({
  selector: 'app-toast-host',
  imports: [ShellIconComponent],
  template: `
    <div
      class="toasts"
      role="status"
      aria-relevant="additions"
      (mouseenter)="service.pause()"
      (mouseleave)="service.resume()"
      (focusin)="service.pause()"
      (focusout)="onFocusOut($event)"
    >
      @for (toast of service.toasts(); track toast.id) {
        <div
          class="toast"
          [class.toast--error]="toast.tone === 'error'"
          [attr.role]="toast.tone === 'error' ? 'alert' : null"
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
            <button type="button" class="toast__action" (click)="service.act(toast.id)">
              {{ toast.action }}
            </button>
          }
          <button
            type="button"
            class="toast__close"
            aria-label="Close"
            (click)="service.close(toast.id, false)"
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
    @media (max-width: 959.98px) {
      :host {
        left: 16px;
        right: 16px;
        width: auto;
        bottom: calc(64px + env(safe-area-inset-bottom) + 12px);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHostComponent {
  protected readonly service = inject(ToastService);

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !(event.currentTarget as HTMLElement).contains(next)) {
      this.service.resume();
    }
  }
}
