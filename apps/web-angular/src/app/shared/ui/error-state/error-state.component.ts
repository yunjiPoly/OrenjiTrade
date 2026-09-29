import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Error state with a retry action. Use `compact` for inline widgets (footer, cards).
 */
@Component({
  selector: 'app-error-state',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="error-state" [class.error-state--compact]="compact()" role="alert">
      <mat-icon class="error-state__icon" aria-hidden="true">error</mat-icon>
      <div class="error-state__body">
        <p class="error-state__title">{{ title() }}</p>
        @if (message()) {
          <p class="error-state__message">{{ message() }}</p>
        }
        @if (requestId()) {
          <p class="error-state__request">
            Request id <span class="mono">{{ requestId() }}</span>
          </p>
        }
      </div>
      <button matButton="outlined" type="button" class="error-state__retry" (click)="retry.emit()">
        <mat-icon aria-hidden="true">refresh</mat-icon>
        {{ retryLabel() }}
      </button>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--spacing-3);
      padding: var(--spacing-8) var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface-variant);
    }
    .error-state--compact {
      flex-direction: row;
      text-align: left;
      padding: var(--spacing-2) var(--spacing-3);
      gap: var(--spacing-2);
    }
    .error-state__icon {
      color: var(--color-danger);
    }
    .error-state__body {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
    }
    .error-state__body p {
      margin: 0;
    }
    .error-state__title {
      font-weight: var(--font-weight-semibold);
    }
    .error-state__message,
    .error-state__request {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorStateComponent {
  readonly title = input('Something went wrong');
  readonly message = input('');
  readonly requestId = input<string | null>(null);
  readonly retryLabel = input('Retry');
  readonly compact = input(false, { transform: booleanAttribute });
  readonly retry = output<void>();
}
