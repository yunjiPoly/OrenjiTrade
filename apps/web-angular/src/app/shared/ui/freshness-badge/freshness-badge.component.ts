import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';
import { DateInput, RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { FRESHNESS_LABELS, FreshnessState, freshnessFromDate } from './freshness';

/**
 * Freshness badge: coloured dot + state label + "Updated 3 hours ago".
 * `state` can be given explicitly (from the API) or derived from `updatedAt`.
 */
@Component({
  selector: 'app-freshness-badge',
  imports: [RelativeTimePipe],
  template: `
    <span class="badge" [class]="'badge badge--' + effectiveState()">
      <span class="badge__dot" aria-hidden="true"></span>
      <span class="badge__state" [class.visually-hidden]="hideState()">{{ stateLabel() }}</span>
      @if (label()) {
        @if (!hideState()) {
          <span class="badge__separator" aria-hidden="true">·</span>
        }
        <span class="badge__time">{{ label() }}</span>
      } @else if (updatedAt()) {
        <span class="badge__separator" aria-hidden="true">·</span>
        <span class="badge__time">Updated {{ updatedAt() | relativeTime: now() }}</span>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      max-width: 100%;
    }
    .badge {
      max-width: 100%;
      overflow: hidden;
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      padding: 2px var(--spacing-2);
      border-radius: var(--radius-pill);
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      font-size: var(--font-size-xs);
      line-height: 1.4;
      white-space: nowrap;
      color: var(--color-text-muted);
      --badge-color: var(--color-status-hidden);
    }
    .badge--fresh {
      --badge-color: var(--color-status-fresh);
    }
    .badge--aging {
      --badge-color: var(--color-status-aging);
    }
    .badge--stale {
      --badge-color: var(--color-status-stale);
    }
    .badge__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--badge-color);
      flex: 0 0 auto;
    }
    .badge__time {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .badge__state {
      color: var(--color-ink);
      font-weight: var(--font-weight-medium);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreshnessBadgeComponent {
  /** Explicit state from the API. When omitted it is derived from `updatedAt`. */
  readonly state = input<FreshnessState | null>(null);
  readonly updatedAt = input<DateInput>(null);
  /** Server-worded time label ("Updated 3 hours ago"); replaces the one derived from `updatedAt`. */
  readonly label = input<string | null>(null);
  /** Compact: a fresh listing shows only its dot and time (the state stays for screen readers). */
  readonly compact = input(false, { transform: booleanAttribute });
  /** Reference time; override in tests for deterministic labels. */
  readonly now = input<Date | number>(Date.now());

  protected readonly effectiveState = computed<FreshnessState>(
    () => this.state() ?? freshnessFromDate(this.updatedAt(), this.now()),
  );
  protected readonly stateLabel = computed(() => FRESHNESS_LABELS[this.effectiveState()]);
  protected readonly hideState = computed(
    () => this.compact() && !!this.label() && this.effectiveState() === 'fresh',
  );
}
