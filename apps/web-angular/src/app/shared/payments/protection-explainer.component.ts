import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { PROTECTION_COPY } from './payment-labels';

/**
 * How payment protection works, in four steps, with the intermediary disclaimer and a link to
 * the Payment Protection Policy. `collapsed` starts as a one-line summary that expands (native
 * `<details>`, keyboard accessible) — used inside dialogs; expanded on the checkout page.
 */
@Component({
  selector: 'app-protection-explainer',
  imports: [RouterLink, MatIconModule],
  template: `
    <details class="pe" [open]="!collapsed()" data-testid="protection-explainer">
      <summary class="pe__summary">
        <mat-icon aria-hidden="true" class="pe__shield">verified_user</mat-icon>
        <span class="pe__lead">{{ copy.short }}</span>
        <span class="pe__more" aria-hidden="true">How it works</span>
      </summary>
      <ol class="pe__steps">
        @for (step of copy.steps; track $index) {
          <li>
            <span class="pe__num" aria-hidden="true">{{ $index + 1 }}</span>
            <span>{{ step }}</span>
          </li>
        }
      </ol>
      <p class="pe__fine">
        {{ copy.intermediary }}
        <a routerLink="/legal/payment-protection">Payment Protection Policy</a>
      </p>
    </details>
  `,
  styles: `
    :host {
      display: block;
    }
    .pe {
      border: 1px solid color-mix(in srgb, var(--color-success) 35%, var(--color-border));
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-success) 7%, var(--color-surface));
    }
    .pe__summary {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      padding: var(--spacing-2) var(--spacing-3);
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      cursor: pointer;
      list-style: none;
    }
    .pe__summary::-webkit-details-marker {
      display: none;
    }
    .pe__shield {
      flex: 0 0 auto;
      color: var(--color-success);
    }
    .pe__lead {
      flex: 1 1 auto;
    }
    .pe__more {
      flex: 0 0 auto;
      color: var(--color-accent);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      text-decoration: underline;
    }
    .pe[open] .pe__more {
      display: none;
    }
    .pe__steps {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: 0;
      padding: 0 var(--spacing-3) var(--spacing-2);
      list-style: none;
      font-size: var(--font-size-sm);
    }
    .pe__steps li {
      display: flex;
      gap: var(--spacing-2);
    }
    .pe__num {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--color-success);
      color: #fff;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .pe__fine {
      margin: 0;
      padding: 0 var(--spacing-3) var(--spacing-3);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProtectionExplainerComponent {
  readonly collapsed = input(false, { transform: booleanAttribute });
  protected readonly copy = PROTECTION_COPY;
}
