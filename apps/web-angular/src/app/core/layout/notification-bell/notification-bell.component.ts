import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NotificationCenter } from '../../notifications/notification-center.service';
import { notificationText } from '../../notifications/notification-kinds';
import { RealtimeService } from '../../realtime/realtime.service';
import { PopoverRef, Popovers } from '../popover/popover.service';
import { ShellIconComponent } from '../shell-icon/shell-icon.component';

/** How long the badge "bumps" after a new notification arrives. */
const BUMP_MS = 700;

/**
 * Top-bar bell (spec 4.3 and 12): the unread dot kept live by the realtime channel (chats left out,
 * `excludeTypes=MESSAGE`), "Notifications, {n} new" for screen readers, and the popover of the
 * latest notifications (board W24), loaded on the first press. Signed-out visitors are invited to
 * sign in there.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [MatTooltipModule, ShellIconComponent],
  template: `
    <button
      #bell
      type="button"
      class="bell"
      data-testid="notification-bell"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="label()"
      [attr.data-realtime]="realtime.state()"
      matTooltip="Notifications"
      [matTooltipDisabled]="open()"
      (click)="toggle()"
    >
      <app-shell-icon name="bell" [size]="20" />
      @if (unread() > 0) {
        <span
          class="bell__dot"
          [class.bell__dot--bump]="bump()"
          data-testid="notification-badge"
          aria-hidden="true"
        ></span>
      }
    </button>
    <span class="visually-hidden" aria-live="polite">{{ announcement() }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    /* 40 round on surface, an 8 px orange dot when unread (spec 4.3, board W1). */
    .bell {
      position: relative;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-ink);
      cursor: pointer;
    }
    .bell:hover {
      background: var(--color-surface-variant);
    }
    .bell__dot {
      position: absolute;
      top: 8px;
      right: 9px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-primary);
      box-shadow: 0 0 0 2px var(--color-surface);
      pointer-events: none;
    }
    .bell__dot--bump {
      animation: bell-bump var(--motion-duration-slow) var(--motion-easing-standard);
    }
    @keyframes bell-bump {
      30% {
        transform: scale(1.35);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bell__dot--bump {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationBellComponent {
  protected readonly center = inject(NotificationCenter);
  protected readonly realtime = inject(RealtimeService);
  private readonly popovers = inject(Popovers);
  private readonly bellButton = viewChild.required<ElementRef<HTMLButtonElement>>('bell');

  protected readonly unread = computed(() =>
    this.center.active() ? this.center.unreadCount() : 0,
  );
  protected readonly label = computed(() => {
    const unread = this.unread();
    return unread > 0 ? `Notifications, ${unread} new` : 'Notifications';
  });
  protected readonly announcement = computed(() => {
    const last = this.center.lastPush();
    return last ? `New notification: ${notificationText(last).title}` : '';
  });
  protected readonly bump = signal(false);
  protected readonly open = signal(false);

  private bumpTimer: ReturnType<typeof setTimeout> | null = null;
  private ref: PopoverRef | null = null;

  constructor() {
    let previous = 0;
    effect(() => {
      const unread = this.unread();
      untracked(() => {
        if (unread > previous) {
          this.startBump();
        }
        previous = unread;
      });
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.bumpTimer) {
        clearTimeout(this.bumpTimer);
      }
      this.ref?.close(false);
    });
  }

  /** Opens or closes the popover (its chunk loads on the first press). */
  protected async toggle(): Promise<void> {
    if (this.ref) {
      this.ref.close();
      return;
    }
    this.open.set(true);
    try {
      const { NotificationPopoverComponent } = await import('./notification-popover.component');
      const ref = this.popovers.open(
        this.bellButton().nativeElement,
        NotificationPopoverComponent,
        {
          width: 400,
          alignEnd: true,
          panelClass: 'app-popover--bell',
        },
      );
      this.ref = ref;
      ref.closed$.subscribe(() => {
        this.ref = null;
        this.open.set(false);
      });
    } catch {
      this.open.set(false);
    }
  }

  private startBump(): void {
    if (this.bumpTimer) {
      clearTimeout(this.bumpTimer);
    }
    this.bump.set(false);
    // Next frame, so the animation restarts when two notifications arrive close together.
    queueMicrotask(() => this.bump.set(true));
    this.bumpTimer = setTimeout(() => {
      this.bumpTimer = null;
      this.bump.set(false);
    }, BUMP_MS);
  }
}
