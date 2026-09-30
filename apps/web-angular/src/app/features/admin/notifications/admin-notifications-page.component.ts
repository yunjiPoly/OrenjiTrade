import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AdminNotificationsService,
  BroadcastRequest,
  NotificationResponse,
  NotificationStats,
} from '@orenji/api-client';
import { SessionService } from '../../../core/auth/session.service';
import { notificationKind } from '../../../core/notifications/notification-kinds';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { confirmAdminAction, runAdminAction } from '../shared/admin-actions';
import { BroadcastFormComponent } from './broadcast-form.component';

const PERIODS = [1, 7, 30] as const;
const CHANNEL_LABELS: Record<string, string> = {
  realtime: 'In-app',
  push: 'Push',
  email: 'E-mail',
};

/**
 * `/admin/notifications` (administrators): notification statistics of a period
 * (`GET /admin/notifications/stats?days=`: totals, unread, failures of 24 h, counts per type and
 * per channel state, push tokens) and, for SUPER_ADMIN, the broadcast composer
 * (`POST /admin/notifications/broadcast`, confirmed, audited).
 */
@Component({
  selector: 'app-admin-notifications-page',
  imports: [
    DatePipe,
    MatButtonToggleModule,
    MatIconModule,
    BroadcastFormComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Notifications"
        subtitle="What reached collectors in-app, by push and by e-mail (local log providers), and announcements to everyone."
      >
        <mat-button-toggle-group
          actions
          [value]="days()"
          aria-label="Period"
          (change)="setDays($event.value)"
        >
          @for (period of periods; track period) {
            <mat-button-toggle [value]="period">{{
              period === 1 ? '24 h' : period + ' days'
            }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
      </app-page-header>

      @if (error(); as error) {
        <app-error-state
          title="Statistics could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="load()"
        />
      } @else if (stats(); as s) {
        <ul class="tiles" aria-label="Notification totals">
          <li class="tile">
            <span class="tile__label">Sent</span>
            <span class="tile__value">{{ s.total }}</span>
          </li>
          <li class="tile">
            <span class="tile__label">Unread</span>
            <span class="tile__value">{{ s.unread }}</span>
          </li>
          <li class="tile" [class.tile--alert]="s.failedLast24h > 0">
            <span class="tile__label">Failed (24 h)</span>
            <span class="tile__value">{{ s.failedLast24h }}</span>
          </li>
          <li class="tile">
            <span class="tile__label">Push devices</span>
            <span class="tile__value">{{ s.pushTokens['active'] ?? 0 }}</span>
            <span class="tile__hint">{{ s.pushTokens['invalid'] ?? 0 }} invalid</span>
          </li>
        </ul>
        <p class="admin-muted">
          {{ s.from | date: 'mediumDate' }} – {{ s.to | date: 'mediumDate' }}
        </p>

        <div class="grid">
          <section class="admin-card" aria-labelledby="notif-types">
            <h2 id="notif-types">By type</h2>
            @if (types().length === 0) {
              <p class="admin-muted">No notifications in this period.</p>
            } @else {
              <ul class="bars">
                @for (type of types(); track type.key) {
                  <li class="bar">
                    <span class="bar__label">
                      <mat-icon aria-hidden="true">{{ type.icon }}</mat-icon
                      >{{ type.label }}
                    </span>
                    <span class="bar__track" aria-hidden="true">
                      <span class="bar__fill" [style.width.%]="type.percent"></span>
                    </span>
                    <span class="bar__value">{{ type.count }}</span>
                  </li>
                }
              </ul>
            }
          </section>
          <section class="admin-card" aria-labelledby="notif-channels">
            <h2 id="notif-channels">Delivery channels</h2>
            <table class="channels" aria-labelledby="notif-channels">
              <thead>
                <tr>
                  <th scope="col">Channel</th>
                  @for (state of channelStates(); track state) {
                    <th scope="col">{{ stateLabel(state) }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (channel of channels(); track channel.name) {
                  <tr>
                    <th scope="row">{{ channelLabel(channel.name) }}</th>
                    @for (state of channelStates(); track state) {
                      <td>{{ channel.counts[state] ?? 0 }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
            <p class="admin-muted channels__note">
              Push and e-mail use local log providers; nothing leaves this machine.
            </p>
          </section>
        </div>
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading statistics</span>
          <app-skeleton height="120px" />
          <app-skeleton variant="list" lines="4" />
        </div>
      }

      <section class="admin-card broadcast" aria-labelledby="notif-broadcast">
        <h2 id="notif-broadcast">Broadcast an announcement</h2>
        @if (session.isSuperAdmin()) {
          <p class="admin-muted">
            One notice per reachable account (their notification preferences apply). Try it on staff
            first.
          </p>
          <app-broadcast-form [busy]="sending()" (send)="broadcast($event)" />
        } @else {
          <p class="admin-muted">
            <mat-icon aria-hidden="true" class="inline-icon">lock</mat-icon>
            Only a super admin can broadcast to every collector.
          </p>
        }
      </section>
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: var(--spacing-3);
      margin: 0 0 var(--spacing-2);
      padding: 0;
      list-style: none;
    }
    .tile {
      display: flex;
      flex-direction: column;
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .tile--alert {
      border-color: color-mix(in srgb, var(--color-danger) 50%, var(--color-border));
    }
    .tile__label,
    .tile__hint {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .tile__value {
      font-family: var(--font-display);
      font-size: var(--font-size-3xl);
      font-weight: var(--font-weight-semibold);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: var(--spacing-4);
      margin: var(--spacing-4) 0;
    }
    .bars {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .bar {
      display: grid;
      grid-template-columns: minmax(150px, auto) 1fr 3em;
      align-items: center;
      gap: var(--spacing-2);
      font-size: var(--font-size-sm);
    }
    .bar__label {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
    }
    .bar__label mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
      color: var(--color-primary);
    }
    .bar__track {
      height: 8px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      overflow: hidden;
    }
    .bar__fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--color-primary);
    }
    .bar__value {
      font-weight: var(--font-weight-semibold);
      text-align: right;
    }
    .channels {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--font-size-sm);
    }
    .channels th,
    .channels td {
      padding: var(--spacing-1) var(--spacing-2);
      border-bottom: 1px solid var(--color-border);
      text-align: left;
    }
    .channels__note {
      margin-top: var(--spacing-2);
    }
    .broadcast h2 {
      margin-bottom: var(--spacing-1);
    }
    .inline-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
      vertical-align: text-bottom;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminNotificationsPageComponent {
  private readonly api = inject(AdminNotificationsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly form = viewChild(BroadcastFormComponent);
  protected readonly session = inject(SessionService);

  protected readonly periods = PERIODS;
  protected readonly days = signal<number>(7);
  protected readonly stats = signal<NotificationStats | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly sending = signal(false);

  protected readonly types = computed(() => {
    const byType = this.stats()?.byType ?? {};
    const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...entries.map(([, count]) => count));
    return entries.map(([key, count]) => {
      const kind = notificationKind({ type: key as NotificationResponse['type'], data: {} });
      return { key, count, label: kind.label, icon: kind.icon, percent: (count / max) * 100 };
    });
  });
  protected readonly channels = computed(() =>
    Object.entries(this.stats()?.channels ?? {}).map(([name, counts]) => ({ name, counts })),
  );
  protected readonly channelStates = computed(() => {
    const states = new Set<string>();
    for (const channel of this.channels()) {
      Object.keys(channel.counts).forEach((state) => states.add(state));
    }
    return [...states].sort();
  });

  constructor() {
    this.load();
  }

  protected setDays(days: number): void {
    this.days.set(days);
    this.load();
  }

  protected load(): void {
    this.error.set(null);
    this.stats.set(null);
    this.api
      .getNotificationStats({ days: this.days() }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (stats) => this.stats.set(stats),
        error: (error: unknown) => this.error.set(toApiError(error)),
      });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected channelLabel(name: string): string {
    return CHANNEL_LABELS[name] ?? name;
  }

  protected stateLabel(state: string): string {
    return state.charAt(0) + state.slice(1).toLowerCase();
  }

  protected async broadcast(request: BroadcastRequest): Promise<void> {
    const everyone = request.audience === 'ALL';
    const confirmed = await confirmAdminAction(this.dialog, {
      title: everyone ? 'Send to every collector?' : 'Send to staff?',
      message: `“${request.title}” goes out as a notification to ${
        everyone ? 'every reachable account' : 'moderators and administrators'
      }. It cannot be recalled.`,
      confirmLabel: 'Send broadcast',
      tone: everyone ? 'danger' : 'default',
    });
    if (!confirmed) {
      return;
    }
    this.sending.set(true);
    const result = await runAdminAction(
      this.snackBar,
      this.api.broadcastNotification({ broadcastRequest: request }, 'body', false, {
        context: silentErrors(),
      }),
      'Broadcast sent.',
    );
    this.sending.set(false);
    if (result) {
      this.snackBar.open(
        `Broadcast sent to ${result.recipients} ${result.recipients === 1 ? 'account' : 'accounts'}` +
          (result.skipped ? ` (${result.skipped} skipped by their preferences).` : '.') +
          ' The action is in the audit log.',
        'OK',
        { duration: 6000 },
      );
      this.form()?.reset();
      this.load();
    }
  }
}
