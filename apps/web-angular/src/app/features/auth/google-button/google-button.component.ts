import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

/** "Continue with Google" button with the multicolour G mark. */
@Component({
  selector: 'app-google-button',
  imports: [MatButtonModule],
  template: `
    <button
      matButton="outlined"
      type="button"
      class="google"
      [disabled]="disabled() || busy()"
      (click)="pressed.emit()"
    >
      <svg class="google__mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
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
      {{ busy() ? 'Opening Google…' : label() }}
    </button>
  `,
  styles: `
    :host {
      display: block;
    }
    .google {
      width: 100%;
      height: 44px;
    }
    .google__mark {
      width: 18px;
      height: 18px;
      margin-right: var(--spacing-2);
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
