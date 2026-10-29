import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import type { ConversationSummary } from '@orenji/api-client';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { CHAT_COPY } from '../data/chat-copy';
import { chatStatusLine } from '../data/deal-rules';

export type ThreadMenuAction =
  'mute' | 'unmute' | 'archive' | 'block' | 'unblock' | 'report' | 'rate';

/**
 * The chat's header (64, spec 10.3, boards W18 to W20): back to the inbox (one pane per route
 * below 960), the 36 avatar with its online dot, the handle (16/600, opens the profile) and
 * "Online · Quebec" (the state or province, never a city), "typing…" while they type; on the
 * right the "Deal" toggle (`aria-pressed`) and "⋯": "Rate {h}" (when a deal or a conversation
 * made the pair eligible), Mute, Archive, "Report {h}", "Block {h}" (or Unblock).
 */
@Component({
  selector: 'app-thread-header',
  imports: [RouterLink, MatIconModule, MatMenuModule, AvatarComponent],
  template: `
    @let c = conversation();
    <header class="head">
      @if (showBack()) {
        <button
          type="button"
          class="head__icon"
          aria-label="Back to conversations"
          (click)="back.emit()"
        >
          <mat-icon aria-hidden="true">arrow_back</mat-icon>
        </button>
      }
      <a
        class="head__who"
        [routerLink]="['/collectors', c.other.handle]"
        [attr.aria-label]="copy.profile(c.other.handle)"
      >
        <span class="head__avatar">
          <app-avatar
            size="sm"
            [src]="c.other.avatarUrl"
            [name]="c.other.displayName"
            [decorative]="true"
          />
          @if (c.other.onlineStatus === 'ONLINE' && !blocked()) {
            <span class="head__online" aria-hidden="true"></span>
          }
        </span>
        <span class="head__names">
          <span class="head__name">{{ c.other.handle }}</span>
          @if (status()) {
            <span class="head__status" [class.head__status--live]="typing()">{{ status() }}</span>
          }
        </span>
      </a>
      @if (showDeal()) {
        <button
          type="button"
          class="head__deal"
          data-testid="deal-toggle"
          aria-controls="deal-panel"
          [attr.aria-pressed]="dealOpen()"
          (click)="dealToggle.emit()"
        >
          <mat-icon aria-hidden="true">{{ dealOpen() ? 'right_panel_close' : 'right_panel_open' }}</mat-icon>
          {{ copy.deal }}
        </button>
      }
      <button
        type="button"
        class="head__icon"
        [attr.aria-label]="copy.more(c.other.handle)"
        [matMenuTriggerFor]="menu"
      >
        <mat-icon aria-hidden="true">more_horiz</mat-icon>
      </button>
      <mat-menu #menu="matMenu" xPosition="before">
        @if (canRate()) {
          <button mat-menu-item type="button" (click)="action.emit('rate')">
            <mat-icon aria-hidden="true">star</mat-icon>
            {{ copy.rate(c.other.handle) }}
          </button>
        }
        @if (c.muted) {
          <button mat-menu-item type="button" (click)="action.emit('unmute')">
            <mat-icon aria-hidden="true">notifications_active</mat-icon>
            {{ copy.unmute }}
          </button>
        } @else {
          <button mat-menu-item type="button" (click)="action.emit('mute')">
            <mat-icon aria-hidden="true">notifications_off</mat-icon>
            {{ copy.mute }}
          </button>
        }
        <button mat-menu-item type="button" (click)="action.emit('archive')">
          <mat-icon aria-hidden="true">archive</mat-icon>
          {{ copy.archive }}
        </button>
        <button mat-menu-item type="button" class="head__danger" (click)="action.emit('report')">
          <mat-icon aria-hidden="true">flag</mat-icon>
          {{ copy.report(c.other.handle) }}
        </button>
        @if (blocked()) {
          <button mat-menu-item type="button" (click)="action.emit('unblock')">
            <mat-icon aria-hidden="true">lock_open</mat-icon>
            {{ copy.unblock(c.other.handle) }}
          </button>
        } @else {
          <button mat-menu-item type="button" class="head__danger" (click)="action.emit('block')">
            <mat-icon aria-hidden="true">block</mat-icon>
            {{ copy.block(c.other.handle) }}
          </button>
        }
      </mat-menu>
    </header>
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      min-height: 64px;
      padding: 0 var(--spacing-4) 0 var(--spacing-5);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-background);
    }
    .head__icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--color-ink);
      cursor: pointer;
    }
    .head__icon:hover {
      background: var(--color-surface-variant);
    }
    .head__icon:focus-visible,
    .head__deal:focus-visible,
    .head__who:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .head__who {
      display: flex;
      flex: 1 1 auto;
      align-items: center;
      gap: var(--spacing-3);
      min-width: 0;
      padding: 4px;
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
      border: 2px solid var(--color-background);
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
      color: var(--color-ink);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .head__status {
      overflow: hidden;
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .head__status--live {
      color: var(--color-accent);
    }
    .head__deal {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 6px;
      height: 36px;
      padding: 0 14px 0 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-text-secondary);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .head__deal mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .head__deal[aria-pressed='true'] {
      border-color: var(--color-border-strong);
      background: var(--color-surface-variant);
      color: var(--color-ink);
    }
    .head__deal[aria-pressed='true'] mat-icon {
      color: var(--color-primary);
    }
    .head__danger {
      color: var(--color-danger);
    }
    @media (max-width: 599.98px) {
      .head {
        padding: 0 var(--spacing-2);
      }
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
  /** The "Deal" toggle (the Messages page; the drawer has none). */
  readonly showDeal = input(false);
  readonly dealOpen = input(false);
  readonly back = output<void>();
  readonly dealToggle = output<void>();
  readonly action = output<ThreadMenuAction>();

  protected readonly copy = CHAT_COPY;
  protected readonly status = computed(() =>
    chatStatusLine(this.conversation(), this.typing(), this.blocked()),
  );
}
