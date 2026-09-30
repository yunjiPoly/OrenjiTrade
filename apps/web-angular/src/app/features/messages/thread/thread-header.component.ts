import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import type { ConversationSummary } from '@orenji/api-client';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';

export type ThreadMenuAction =
  'mute' | 'unmute' | 'archive' | 'block' | 'unblock' | 'report' | 'rate';

/**
 * Thread header: back to the list, the other collector (avatar, online dot, "typing…", link to
 * their profile) and the conversation menu: mute, archive, "Rate" (when the conversation or
 * another interaction made the pair eligible), block/unblock and "Report collector".
 */
@Component({
  selector: 'app-thread-header',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatMenuModule, AvatarComponent],
  template: `
    @let c = conversation();
    <header class="head">
      @if (showBack()) {
        <button
          matIconButton
          type="button"
          aria-label="Back to conversations"
          (click)="back.emit()"
        >
          <mat-icon>arrow_back</mat-icon>
        </button>
      }
      <a
        class="head__who"
        [routerLink]="['/collectors', c.other.handle]"
        [attr.aria-label]="'Open the profile of ' + c.other.displayName"
      >
        <span class="head__avatar">
          <app-avatar
            size="sm"
            [src]="c.other.avatarUrl"
            [name]="c.other.displayName"
            [decorative]="true"
          />
          @if (c.other.onlineStatus === 'ONLINE') {
            <span class="head__online" aria-hidden="true"></span>
          }
        </span>
        <span class="head__names">
          <span class="head__name">{{ c.other.displayName }}</span>
          <span class="head__status" [class.head__status--live]="typing()">{{ status() }}</span>
        </span>
      </a>
      <button
        matIconButton
        type="button"
        class="head__menu"
        [attr.aria-label]="'Conversation options for ' + c.other.displayName"
        [matMenuTriggerFor]="menu"
      >
        <mat-icon>more_vert</mat-icon>
      </button>
      <mat-menu #menu="matMenu" xPosition="before">
        @if (c.muted) {
          <button mat-menu-item type="button" (click)="action.emit('unmute')">
            <mat-icon aria-hidden="true">notifications_active</mat-icon>
            Unmute
          </button>
        } @else {
          <button mat-menu-item type="button" (click)="action.emit('mute')">
            <mat-icon aria-hidden="true">notifications_off</mat-icon>
            Mute
          </button>
        }
        <button mat-menu-item type="button" (click)="action.emit('archive')">
          <mat-icon aria-hidden="true">archive</mat-icon>
          Archive
        </button>
        @if (canRate()) {
          <button mat-menu-item type="button" (click)="action.emit('rate')">
            <mat-icon aria-hidden="true">star</mat-icon>
            Rate {{ c.other.displayName }}
          </button>
        }
        @if (blocked()) {
          <button mat-menu-item type="button" (click)="action.emit('unblock')">
            <mat-icon aria-hidden="true">lock_open</mat-icon>
            Unblock {{ c.other.displayName }}
          </button>
        } @else {
          <button mat-menu-item type="button" class="head__danger" (click)="action.emit('block')">
            <mat-icon aria-hidden="true">block</mat-icon>
            Block {{ c.other.displayName }}
          </button>
        }
        <button mat-menu-item type="button" class="head__danger" (click)="action.emit('report')">
          <mat-icon aria-hidden="true">flag</mat-icon>
          Report collector
        </button>
      </mat-menu>
    </header>
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      min-height: 60px;
      padding: var(--spacing-2) var(--spacing-2) var(--spacing-2) var(--spacing-3);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
    }
    .head__who {
      display: flex;
      flex: 1 1 auto;
      align-items: center;
      gap: var(--spacing-3);
      min-width: 0;
      padding: var(--spacing-1);
      border-radius: var(--radius-md);
      color: inherit;
      text-decoration: none;
    }
    .head__who:hover .head__name {
      text-decoration: underline;
    }
    .head__avatar {
      position: relative;
      flex: 0 0 auto;
    }
    .head__online {
      position: absolute;
      right: -1px;
      bottom: -1px;
      width: 11px;
      height: 11px;
      border: 2px solid var(--color-surface);
      border-radius: 50%;
      background: var(--color-online-online);
    }
    .head__names {
      display: flex;
      flex-direction: column;
      min-width: 0;
      line-height: 1.25;
    }
    .head__name {
      overflow: hidden;
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .head__status {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .head__status--live {
      color: var(--color-primary);
    }
    .head__danger {
      color: var(--color-danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThreadHeaderComponent {
  readonly conversation = input.required<ConversationSummary>();
  readonly typing = input(false);
  readonly blocked = input(false);
  /** An unrated interaction with the other collector exists (`GET /ratings/eligibility`). */
  readonly canRate = input(false);
  readonly showBack = input(true);
  readonly back = output<void>();
  readonly action = output<ThreadMenuAction>();

  protected readonly status = computed(() => {
    const other = this.conversation().other;
    if (this.blocked()) {
      return 'Blocked';
    }
    if (this.typing()) {
      return 'typing…';
    }
    return other.onlineStatus === 'ONLINE' ? 'Online now' : `@${other.handle}`;
  });
}
