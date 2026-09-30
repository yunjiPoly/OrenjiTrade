import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import type { ConversationParticipant, MessageResponse } from '@orenji/api-client';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { buildThreadItems } from '../data/thread-items';
import { MessageBubbleComponent } from './message-bubble.component';

/** Within this distance from the bottom, new messages keep the view scrolled to the end. */
const STICK_TO_BOTTOM_PX = 120;
/** Scrolled this close to the top, the previous page is requested. */
const LOAD_OLDER_PX = 200;

/**
 * The scrolling message history: day separators, sender groups, "Seen"/"Sent" under the caller's
 * newest message and the typing indicator. Scrolling to the top loads older messages (the view
 * keeps its position while they are inserted); new messages scroll into view when the reader is
 * at the end. The log is announced politely to screen readers.
 */
@Component({
  selector: 'app-message-list',
  imports: [AvatarComponent, MessageBubbleComponent, SkeletonComponent],
  template: `
    <div
      #scroller
      class="scroller"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      [attr.aria-label]="'Messages with ' + other().displayName"
      [attr.aria-busy]="loadingOlder()"
      tabindex="0"
    >
      <div #sentinel class="sentinel" aria-hidden="true"></div>
      @if (loadingOlder()) {
        <div class="older" aria-hidden="true">
          <app-skeleton variant="list" lines="2" />
        </div>
      } @else if (!hasOlder() && messages().length > 0) {
        <p class="start">
          This is the beginning of your conversation with {{ other().displayName }}.
        </p>
      }
      @for (item of items(); track item.key) {
        @if (item.kind === 'day') {
          <div class="day" role="separator" [attr.aria-label]="item.label">
            <span>{{ item.label }}</span>
          </div>
        } @else {
          <div
            class="msg"
            [class.msg--own]="item.own"
            [class.msg--first]="item.firstOfGroup"
            [attr.data-message-id]="item.message.id"
          >
            @if (!item.own) {
              <span class="msg__avatar" aria-hidden="true">
                @if (item.lastOfGroup) {
                  <app-avatar
                    size="xs"
                    [src]="other().avatarUrl"
                    [name]="other().displayName"
                    [decorative]="true"
                  />
                }
              </span>
            }
            <span class="visually-hidden">{{ item.own ? 'You' : other().displayName }}:</span>
            <app-message-bubble
              [message]="item.message"
              [own]="item.own"
              [showTime]="item.lastOfGroup"
            />
          </div>
          @if (item.status) {
            <p class="receipt" [attr.data-testid]="'receipt-' + item.status">
              {{ item.status === 'seen' ? 'Seen' : 'Sent' }}
            </p>
          }
        }
      }
      @if (typing()) {
        <div class="typing" data-testid="typing-indicator">
          <span class="typing__dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <span>{{ other().displayName }} is typing…</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .scroller {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 2px;
      padding: var(--spacing-3) var(--spacing-4);
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .scroller:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: calc(-1 * var(--focus-width));
    }
    .sentinel {
      flex: 0 0 1px;
    }
    .start {
      margin: var(--spacing-2) 0 var(--spacing-4);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      text-align: center;
    }
    .day {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      margin: var(--spacing-4) 0 var(--spacing-2);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
    }
    .day::before,
    .day::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--color-border);
    }
    .msg {
      display: flex;
      align-items: flex-end;
      gap: var(--spacing-2);
    }
    .msg--first {
      margin-top: var(--spacing-2);
    }
    .msg--own {
      justify-content: flex-end;
    }
    .msg__avatar {
      flex: 0 0 28px;
      width: 28px;
    }
    .receipt {
      margin: 2px 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      text-align: right;
    }
    .typing {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin-top: var(--spacing-2);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .typing__dots {
      display: inline-flex;
      gap: 3px;
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: 14px;
      background: var(--color-surface-variant);
    }
    .typing__dots i {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-text-muted);
      animation: typing-dot 1.2s infinite ease-in-out;
    }
    .typing__dots i:nth-child(2) {
      animation-delay: 0.15s;
    }
    .typing__dots i:nth-child(3) {
      animation-delay: 0.3s;
    }
    @keyframes typing-dot {
      0%,
      80%,
      100% {
        opacity: 0.35;
        transform: translateY(0);
      }
      40% {
        opacity: 1;
        transform: translateY(-3px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .typing__dots i {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageListComponent {
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly sentinel = viewChild.required<ElementRef<HTMLElement>>('sentinel');

  readonly messages = input.required<readonly MessageResponse[]>();
  readonly other = input.required<ConversationParticipant>();
  readonly selfId = input<string | null>(null);
  readonly hasOlder = input(false);
  readonly loadingOlder = input(false);
  readonly typing = input(false);
  readonly loadOlder = output<void>();

  protected readonly items = computed(() => buildThreadItems(this.messages(), this.selfId()));
  private readonly newestId = computed(() => this.messages().at(-1)?.id ?? null);
  private readonly oldestId = computed(() => this.messages()[0]?.id ?? null);

  private previousNewest: string | null = null;
  private previousOldest: string | null = null;
  private previousHeight = 0;
  private previousTop = 0;
  private stuckToBottom = true;

  constructor() {
    afterRenderEffect(() => {
      const element = this.scroller().nativeElement;
      const newest = this.newestId();
      const oldest = this.oldestId();
      this.typing();
      const olderInserted =
        oldest !== this.previousOldest && newest === this.previousNewest && this.previousHeight > 0;
      if (olderInserted) {
        // Older messages were inserted above: keep what the reader was looking at in place.
        element.scrollTop = this.previousTop + (element.scrollHeight - this.previousHeight);
      } else if (this.stuckToBottom || this.previousNewest === null) {
        element.scrollTop = element.scrollHeight;
      }
      this.previousNewest = newest;
      this.previousOldest = oldest;
      this.previousHeight = element.scrollHeight;
      this.previousTop = element.scrollTop;
      // A short history does not fill the view: keep loading until it scrolls or ends.
      if (
        untracked(() => this.hasOlder() && !this.loadingOlder()) &&
        element.scrollTop <= LOAD_OLDER_PX &&
        (olderInserted || oldest !== null)
      ) {
        this.loadOlder.emit();
      }
    });

    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.scroller().nativeElement;
      const onScroll = () => {
        this.stuckToBottom =
          element.scrollHeight - element.scrollTop - element.clientHeight < STICK_TO_BOTTOM_PX;
        this.previousTop = element.scrollTop;
        this.previousHeight = element.scrollHeight;
      };
      element.addEventListener('scroll', onScroll, { passive: true });
      destroyRef.onDestroy(() => element.removeEventListener('scroll', onScroll));
      if (typeof IntersectionObserver === 'undefined') {
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (
            entries.some((entry) => entry.isIntersecting) &&
            this.hasOlder() &&
            !this.loadingOlder()
          ) {
            this.loadOlder.emit();
          }
        },
        { root: element, rootMargin: `${LOAD_OLDER_PX}px 0px 0px 0px` },
      );
      observer.observe(this.sentinel().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
