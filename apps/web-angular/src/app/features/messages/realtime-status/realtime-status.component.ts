import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RealtimeService } from '../../../core/realtime/realtime.service';

/** Small live indicator of the realtime channel ("Live", "Connecting…", "Reconnecting…"). */
@Component({
  selector: 'app-realtime-status',
  imports: [MatTooltipModule],
  template: `
    <span
      class="rt"
      role="status"
      [attr.data-state]="state()"
      data-testid="realtime-status"
      [matTooltip]="tooltip()"
    >
      <span class="rt__dot" aria-hidden="true"></span>
      <span class="rt__label">{{ label() }}</span>
    </span>
  `,
  styles: `
    .rt {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      white-space: nowrap;
    }
    .rt__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-text-disabled);
    }
    .rt[data-state='connected'] .rt__dot {
      background: var(--color-online-online);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-online-online) 25%, transparent);
    }
    .rt[data-state='connecting'] .rt__dot,
    .rt[data-state='reconnecting'] .rt__dot {
      background: var(--color-warning);
      animation: rt-pulse 1.2s ease-in-out infinite;
    }
    @keyframes rt-pulse {
      50% {
        opacity: 0.3;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .rt__dot {
        animation: none !important;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RealtimeStatusComponent {
  private readonly realtime = inject(RealtimeService);

  protected readonly state = this.realtime.state;
  protected readonly label = computed(() => {
    switch (this.state()) {
      case 'connected':
        return 'Live';
      case 'connecting':
        return 'Connecting…';
      case 'reconnecting':
        return 'Reconnecting…';
      default:
        return 'Offline';
    }
  });
  protected readonly tooltip = computed(() =>
    this.state() === 'connected'
      ? 'New messages arrive instantly'
      : 'Messages still send; new ones appear when the connection is back',
  );
}
