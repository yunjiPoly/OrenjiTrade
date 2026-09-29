import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { statusLabel } from './admin-labels';

/** Coloured pill for an account status. */
@Component({
  selector: 'app-status-chip',
  template: `<span class="status" [attr.data-status]="status()">{{ label() }}</span>`,
  styles: `
    :host {
      display: inline-flex;
    }
    .status {
      --tone: var(--color-status-hidden);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px var(--spacing-2);
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--tone) 14%, var(--color-surface));
      border: 1px solid color-mix(in srgb, var(--tone) 40%, transparent);
      color: var(--color-ink);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      white-space: nowrap;
    }
    .status::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--tone);
    }
    .status[data-status='ACTIVE'] {
      --tone: var(--color-success);
    }
    .status[data-status='SUSPENDED'] {
      --tone: var(--color-danger);
    }
    .status[data-status='DELETION_REQUESTED'] {
      --tone: var(--color-warning);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChipComponent {
  readonly status = input.required<string>();
  protected readonly label = computed(() => statusLabel(this.status()));
}
