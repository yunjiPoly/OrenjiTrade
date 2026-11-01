import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { ConversationSummary } from '@orenji/api-client';
import { ApiError } from '../../../core/http/api-error';
import { KeyboardPrefs } from '../../../core/keyboard/keyboard-prefs.service';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../../shared/ui/segmented/segmented.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { INBOX_COPY } from '../data/chat-copy';
import { filterChats, inboxTime } from '../data/deal-rules';
import { ConversationListStatus } from '../data/conversations.store';
import { listPreview } from '../data/message-text';

type Only = 'all' | 'unread';

/**
 * The inbox (spec 10.2, board W18): a search field (the page's own: "/" focuses it), [All |
 * Unread], and rows of 76: a 44 avatar with the online dot, the handle (bold when unread) and the
 * time (orange when unread), the last message on one line ("You: …", a sale worded for the reader,
 * an old offer as history), the chat's card or deck core as a 28×40 thumbnail. The selected row is
 * `surfaceVariant` with a 2 px orange inset. ↑↓ or j k move, Enter opens, Esc gives the focus back
 * to the list from the chat. Empty: "No chats yet" with [Search cards].
 */
@Component({
  selector: 'app-conversation-list',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    AvatarComponent,
    CardImageComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SegmentedComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="tools">
      <label class="search" data-page-search>
        <mat-icon aria-hidden="true">search</mat-icon>
        <span class="visually-hidden">{{ copy.search }}</span>
        <input
          type="search"
          autocomplete="off"
          data-page-search
          [placeholder]="copy.search"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          (keydown.arrowdown)="focusFirst($event)"
        />
        <kbd class="search__key" aria-hidden="true">/</kbd>
      </label>
      <app-segmented
        size="sm"
        label="Show"
        [options]="segments"
        [value]="only()"
        (valueChange)="only.set($event)"
      />
    </div>
    @switch (status()) {
      @case ('loading') {
        <div class="list-skeleton" aria-busy="true">
          <span class="visually-hidden">Loading conversations</span>
          @for (n of [1, 2, 3, 4, 5]; track n) {
            <div class="sk-row">
              <app-skeleton width="44px" height="44px" />
              <span class="sk-row__text">
                <app-skeleton width="50%" height="14px" />
                <app-skeleton width="80%" height="14px" />
              </span>
            </div>
          }
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
          <app-empty-state icon="forum" [title]="copy.emptyTitle" [description]="copy.emptyBody">
            <a actions matButton="filled" routerLink="/search">{{ copy.emptyAction }}</a>
          </app-empty-state>
        } @else if (shown().length === 0) {
          <app-empty-state icon="filter_list_off" [title]="noneTitle()" [description]="noneBody()">
            <button actions matButton="outlined" type="button" (click)="clearFilters()">
              {{ copy.clear }}
            </button>
          </app-empty-state>
        } @else {
          <ul class="list" aria-label="Conversations">
            @for (c of shown(); track c.id) {
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
                  [attr.data-id]="c.id"
                  [attr.tabindex]="c.id === tabStop() ? 0 : -1"
                  (focus)="roving.set(c.id)"
                  (click)="selected.emit(c.id)"
                  (keydown)="onKeydown($event)"
                >
                  <span class="row__avatar">
                    <app-avatar
                      [src]="c.other.avatarUrl"
                      [name]="c.other.displayName"
                      [decorative]="true"
                    />
                    @if (c.other.onlineStatus === 'ONLINE') {
                      <span class="row__online" aria-hidden="true"></span>
                    }
                  </span>
                  <span class="row__main">
                    <span class="row__top">
                      <span class="row__name">{{ c.other.handle }}</span>
                      <span class="row__time">{{ time(c) }}</span>
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
                  @if (c.subject; as s) {
                    <span class="row__thumb" aria-hidden="true">
                      @if (s.kind === 'DECK_CORE' && !s.imageUrl) {
                        <span class="row__core"><mat-icon>style</mat-icon></span>
                      } @else {
                        <app-card-image size="fill" [src]="s.imageUrl" alt="" />
                      }
                    </span>
                  }
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
  styleUrl: './conversation-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversationListComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly prefs = inject(KeyboardPrefs);

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

  protected readonly copy = INBOX_COPY;
  protected readonly segments: readonly SegmentOption<Only>[] = [
    { value: 'all', label: INBOX_COPY.all },
    { value: 'unread', label: INBOX_COPY.unread },
  ];
  protected readonly only = signal<Only>('all');
  protected readonly query = signal('');
  protected readonly shown = computed(() =>
    filterChats(this.conversations(), this.only(), this.query()),
  );
  protected readonly noneTitle = computed(() =>
    this.query().trim() ? INBOX_COPY.noMatchTitle(this.query().trim()) : INBOX_COPY.noUnreadTitle,
  );
  protected readonly noneBody = computed(() =>
    this.query().trim() ? INBOX_COPY.noMatchBody : INBOX_COPY.noUnreadBody,
  );

  /** The row that last had the focus (the arrows and j k move it). */
  protected readonly roving = signal<string | null>(null);
  /**
   * The list's one Tab stop (a roving tabindex, WC review A8): the row last focused, else the open
   * chat's, else the first. The arrows, j k, Home and End move between the rows.
   */
  protected readonly tabStop = computed(() => {
    const shown = this.shown();
    for (const id of [this.roving(), this.activeId()]) {
      if (id && shown.some((c) => c.id === id)) {
        return id;
      }
    }
    return shown[0]?.id ?? null;
  });

  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });

  /** Gives the focus to the open chat's row, else the first (Esc from the chat). */
  focusActive(): void {
    const rows = this.rows();
    (rows.find((row) => row.getAttribute('aria-current') === 'true') ?? rows[0])?.focus();
  }

  /** Gives the focus to a chat's row (Back from the chat below 960); `false` when it is not shown. */
  focusRow(id: string): boolean {
    const row = this.rows().find((candidate) => candidate.dataset['id'] === id);
    row?.focus();
    return !!row;
  }

  protected clearFilters(): void {
    this.query.set('');
    this.only.set('all');
  }

  protected time(conversation: ConversationSummary): string {
    return inboxTime(conversation.lastMessage?.createdAt ?? conversation.createdAt);
  }

  protected preview(conversation: ConversationSummary): string {
    return listPreview(conversation, this.selfId());
  }

  protected rowLabel(conversation: ConversationSummary): string {
    const parts = [`Conversation with ${conversation.other.handle}`];
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
    parts.push(this.time(conversation));
    parts.push(this.preview(conversation));
    if (conversation.subject) {
      parts.push(INBOX_COPY.about(conversation.subject.name));
    }
    return parts.join(', ');
  }

  protected focusFirst(event: Event): void {
    const first = this.rows()[0];
    if (first) {
      event.preventDefault();
      first.focus();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    // j and k are single-key shortcuts: off with Settings › Appearance's switch (decision 24).
    const letters = this.prefs.singleKeys();
    const down = event.key === 'ArrowDown' || (letters && event.key === 'j');
    const up = event.key === 'ArrowUp' || (letters && event.key === 'k');
    if (!down && !up && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const rows = this.rows();
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
          : Math.min(rows.length - 1, Math.max(0, index + (down ? 1 : -1)));
    rows[next]?.focus();
  }

  private rows(): HTMLButtonElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.row')];
  }
}
