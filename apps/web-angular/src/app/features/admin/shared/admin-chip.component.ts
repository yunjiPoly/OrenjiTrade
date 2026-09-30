import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ChipTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

/** Small coloured pill (report status, listing state, rule action…) for admin lists. */
@Component({
  selector: 'app-admin-chip',
  template: `<span class="chip" [attr.data-tone]="tone()"><ng-content /></span>`,
  styles: `
    :host {
      display: inline-flex;
    }
    .chip {
      --tone: var(--color-status-hidden);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px var(--spacing-2);
      border: 1px solid color-mix(in srgb, var(--tone) 40%, transparent);
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--tone) 14%, var(--color-surface));
      color: var(--color-ink);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      white-space: nowrap;
    }
    .chip::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--tone);
    }
    .chip[data-tone='success'] {
      --tone: var(--color-success);
    }
    .chip[data-tone='warning'] {
      --tone: var(--color-warning);
    }
    .chip[data-tone='danger'] {
      --tone: var(--color-danger);
    }
    .chip[data-tone='info'] {
      --tone: var(--color-info);
    }
    .chip[data-tone='primary'] {
      --tone: var(--color-primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminChipComponent {
  readonly tone = input<ChipTone>('neutral');
}
