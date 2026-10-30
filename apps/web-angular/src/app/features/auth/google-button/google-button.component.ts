import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';

/** "Continue with Google" (spec 14, board W27): the outline 52 button with Google's G mark. */
@Component({
  selector: 'app-google-button',
  template: `
    <button type="button" class="google" [disabled]="disabled() || busy()" (click)="pressed.emit()">
      <span class="google__mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <path
            fill="#EA4335"
            d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"
          />
          <path
            fill="#FBBC05"
            d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"
          />
        </svg>
      </span>
      {{ busy() ? 'Opening Google…' : label() }}
    </button>
  `,
  styles: `
    :host {
      display: block;
    }
    .google {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      box-sizing: border-box;
      width: 100%;
      height: 52px;
      padding: 0 20px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-ink);
      font: inherit;
      font-size: 15px;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .google:hover:not(:disabled) {
      background: var(--color-surface-variant);
    }
    .google:disabled {
      border-color: var(--color-border);
      color: var(--color-text-muted);
      cursor: not-allowed;
    }
    .google:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
    .google__mark {
      display: grid;
      flex: none;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #fff;
    }
    .google__mark svg {
      width: 14px;
      height: 14px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoogleButtonComponent {
  readonly label = input('Continue with Google');
  readonly busy = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly pressed = output<void>();
}
