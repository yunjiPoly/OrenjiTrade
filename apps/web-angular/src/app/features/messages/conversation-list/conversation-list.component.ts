import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { ConversationSummary } from '@orenji/api-client';
import { ApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { ConversationListStatus } from '../data/conversations.store';
import { listPreview } from '../data/message-text';

/**
 * The inbox: avatar with online dot, name, time of the last activity, preview ("You: …" for own
 * messages) and unread badge. Rows are buttons; ArrowUp/ArrowDown/Home/End move between them.
 */
@Component({
  selector: 'app-conversation-list',
  imports: [
    MatButtonModule,
    MatIconModule,
    AvatarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    @switch (status()) {
      @case ('loading') {
        <div class="list-skeleton" aria-busy="true">
          <span class="visually-hidden">Loading conversations</span>
          <app-skeleton variant="list" lines="5" />
        </div>
      }
      @case ('error') {
        <div class="list-pad">
          <app-error-state
            compact
            title="Conversations could not load"
            [message]="errorMessage()"
            (retry)="retry.emit()"
          />
        </div>
      }
      @default {
        @if (conversations().length === 0) {
          <app-empty-state
            icon="forum"
            title="No conversations yet"
            description="Open a collector's preview on the map or their profile and press Message to start trading."
          />
        } @else {
          <ul class="list" aria-label="Conversations" (keydown)="onKeydown($event)">
            @for (c of conversations(); track c.id) {
              @let unread = c.unreadCount > 0;
              <li>
                <button
                  type="button"
                  class="row"
                  [class.row--active]="c.id === activeId()"
                  [class.row--unread]="unread"
                  [attr.aria-current]="c.id === activeId() ? 'true' : null"
                  [attr.aria-label]="rowLabel(c)"
                  [attr.data-conversation]="c.other.handle"
                  (click)="selected.emit(c.id)"
                >
                  <span class="row__avatar">
                    <app-avatar [src]="c.other.avatarUrl" [name]="c.other.displayName" [decorative]="true" />
                    @if (c.other.onlineStatus === 'ONLINE') {
                      <span class="row__online" aria-hidden="true"></span>
                    }
                  </span>
                  <span class="row__main">
                    <span class="row__top">
                      <span class="row__name">{{ c.other.displayName }}</span>
                      <span class="row__time">
                        {{ c.lastMessage?.createdAt ?? c.createdAt | relativeTime }}
                      </span>
                    </span>
                    <span class="row__bottom">
                      <span class="row__preview">{{ preview(c) }}</span>
                      @if (c.muted) {
                        <mat-icon class="row__muted" aria-hidden="true">notifications_off</mat-icon>
                      }
                      @if (unread) {
                        <span class="row__badge" data-testid="unread-badge" aria-hidden="true">
                          {{ c.unreadCount > 99 ? '99+' : c.unreadCount }}
                        </span>
                      }
                    </span>
                  </span>
                </button>
              </li>
            }
          </ul>
          @if (hasMore()) {
            <div class="list-more">
              <button matButton type="button" [disabled]="loadingMore()" (click)="loadMore.emit()">
                {{ loadingMore() ? 'Loading…' : 'Older conversations' }}
              </button>
            </div>
          }
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .list-skeleton,
    .list-pad {
      padding: var(--spacing-3) var(--spacing-4);
    }
    .list {
      margin: 0;
      padding: var(--spacing-1) 0;
      list-style: none;
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      width: 100%;
      padding: var(--spacing-3) var(--spacing-4);
      border: 0;
      border-left: 3px solid transparent;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: background var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .row:hover {
      background: var(--color-surface-variant);
    }
    .row:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: calc(-1 * var(--focus-width));
    }
    .row--active {
      border-left-color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary-container) 55%, transparent);
    }
    .row__avatar {
      position: relative;
      flex: 0 0 auto;
    }
    .row__online {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 12px;
      height: 12px;
      border: 2px solid var(--color-surface);
      border-radius: 50%;
      background: var(--color-online-online);
    }
    .row__main {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .row__top,
    .row__bottom {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
    }
    .row__name {
      flex: 1 1 auto;
      overflow: hidden;
      font-weight: var(--font-weight-medium);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row__time {
      flex: 0 0 auto;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .row__preview {
      flex: 1 1 auto;
      overflow: hidden;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row--unread .row__name,
    .row--unread .row__preview {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .row__muted {
      width: 16px;
      height: 16px;
      color: var(--color-text-muted);
      font-size: 16px;
    }
    .row__badge {
      min-width: 20px;
      padding: 1px 6px;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-on-primary);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-bold);
      text-align: center;
    }
    .list-more {
      display: flex;
      justify-content: center;
      padding: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversationListComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly conversations = input.required<readonly ConversationSummary[]>();
  readonly status = input.required<ConversationListStatus>();
  readonly error = input<ApiError | null>(null);
  readonly activeId = input<string | null>(null);
  readonly selfId = input<string | null>(null);
  readonly hasMore = input(false);
  readonly loadingMore = input(false);
  readonly selected = output<string>();
  readonly retry = output<void>();
  readonly loadMore = output<void>();

  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });

  protected preview(conversation: ConversationSummary): string {
    return listPreview(conversation, this.selfId());
  }

  protected rowLabel(conversation: ConversationSummary): string {
    const parts = [`Conversation with ${conversation.other.displayName}`];
    if (conversation.other.onlineStatus === 'ONLINE') {
      parts.push('online');
    }
    if (conversation.unreadCount > 0) {
      parts.push(
        `${conversation.unreadCount} unread ${conversation.unreadCount === 1 ? 'message' : 'messages'}`,
      );
    }
    if (conversation.muted) {
      parts.push('muted');
    }
    parts.push(this.preview(conversation));
    return parts.join(', ');
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const rows = [...this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.row')];
    const index = rows.indexOf(event.target as HTMLButtonElement);
    if (index < 0) {
      return;
    }
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? rows.length - 1
          : Math.min(rows.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)));
    rows[next]?.focus();
  }
}
