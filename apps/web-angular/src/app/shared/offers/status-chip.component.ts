import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { StatusTone } from './offer-labels';

/** Small status pill of an offer or a trade (icon + label, tone from the design tokens). */
@Component({
  selector: 'app-status-chip',
  imports: [MatIconModule],
  template: `
    <span class="chip" [attr.data-tone]="tone()" data-testid="status-chip">
      <mat-icon aria-hidden="true">{{ icon() }}</mat-icon>
      {{ label() }}
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px var(--spacing-2) 2px 6px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-ink);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      line-height: 1.6;
      white-space: nowrap;
    }
    .chip mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }
    .chip[data-tone='live'] {
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .chip[data-tone='success'] {
      background: color-mix(in srgb, var(--color-success) 16%, var(--color-surface));
      color: var(--color-ink);
    }
    .chip[data-tone='success'] mat-icon {
      color: var(--color-success);
    }
    .chip[data-tone='danger'] {
      background: color-mix(in srgb, var(--color-danger) 14%, var(--color-surface));
    }
    .chip[data-tone='danger'] mat-icon {
      color: var(--color-danger);
    }
    .chip[data-tone='muted'] {
      color: var(--color-text-muted);
    }
    .chip[data-tone='info'] {
      background: color-mix(in srgb, var(--color-info) 14%, var(--color-surface));
    }
    .chip[data-tone='info'] mat-icon {
      color: var(--color-info);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChipComponent {
  readonly label = input.required<string>();
  readonly icon = input('info');
  readonly tone = input<StatusTone>('info');
}
