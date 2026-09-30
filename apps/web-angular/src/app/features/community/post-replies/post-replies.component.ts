import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { ReplyResponse } from '@orenji/api-client';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { REPLY_MAX_LENGTH } from '../data/community-helpers';
import type { ReplyThread } from '../data/community.store';

/** Inline replies of a post (oldest first) with the reply box (1–1000 characters). */
@Component({
  selector: 'app-post-replies',
  imports: [RouterLink, MatButtonModule, MatIconModule, AvatarComponent, RelativeTimePipe, SkeletonComponent],
  template: `
    @let t = thread();
    <div class="replies">
      @switch (t?.status) {
        @case ('error') {
          <p class="replies__note" role="alert">
            Replies could not load.
            <button matButton type="button" (click)="retry.emit()">Retry</button>
          </p>
        }
        @case ('ready') {
          @if (t!.items.length === 0) {
            <p class="replies__note">No replies yet. Start the conversation.</p>
          }
          <ul class="replies__list" [attr.aria-label]="'Replies to ' + postAuthor()">
            @for (reply of t!.items; track reply.id) {
              <li class="reply">
                <app-avatar size="xs" [src]="reply.author.avatarUrl" [name]="reply.author.displayName" [decorative]="true" />
                <div class="reply__body">
                  <p class="reply__meta">
                    <a [routerLink]="['/collectors', reply.author.handle]">{{ reply.author.displayName }}</a>
                    <span>· {{ reply.createdAt | relativeTime }}</span>
                  </p>
                  <p class="reply__text">{{ reply.body }}</p>
                </div>
                @if (reply.author.id === selfId() && reply.canDelete) {
                  <button
                    matIconButton
                    type="button"
                    class="reply__action"
                    [attr.aria-label]="'Delete your reply'"
                    (click)="deleteReply.emit(reply)"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                } @else if (isModerator() && reply.author.id !== selfId()) {
                  <button
                    matIconButton
                    type="button"
                    class="reply__action"
                    [attr.aria-label]="'Remove the reply of ' + reply.author.displayName"
                    (click)="removeReply.emit(reply)"
                  >
                    <mat-icon>remove_moderator</mat-icon>
                  </button>
                }
              </li>
            }
          </ul>
          @if (t!.nextCursor) {
            <button matButton type="button" (click)="more.emit()">More replies</button>
          }
        }
        @default {
          <div aria-busy="true">
            <span class="visually-hidden">Loading replies</span>
            <app-skeleton variant="list" lines="2" />
          </div>
        }
      }

      <form class="reply-box" (submit)="submit($event)">
        <label class="visually-hidden" [for]="fieldId">Reply to {{ postAuthor() }}</label>
        <textarea
          #field
          class="reply-box__text"
          [id]="fieldId"
          rows="1"
          placeholder="Write a reply"
          [attr.maxlength]="maxLength"
          [value]="text()"
          [attr.aria-invalid]="tooLong()"
          (input)="onInput($event)"
          (keydown.enter)="onEnter($event)"
        ></textarea>
        <button matButton="tonal" type="submit" [disabled]="!canSend()">
          {{ t?.sending ? 'Replying…' : 'Reply' }}
        </button>
      </form>
      @if (tooLong()) {
        <p class="reply-box__error" role="alert">Replies are limited to {{ maxLength }} characters.</p>
      }
      @if (t?.error) {
        <p class="reply-box__error" role="alert" data-testid="reply-error">{{ t!.error }}</p>
      }
    </div>
  `,
  styles: `
    .replies {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      padding: var(--spacing-3) 0 0 var(--spacing-4);
      border-left: 2px solid var(--color-border);
    }
    .replies__note {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .replies__list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .reply {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-2);
    }
    .reply__body {
      flex: 1 1 auto;
      min-width: 0;
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
    }
    .reply__meta {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .reply__meta a {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .reply__text {
      margin: 2px 0 0;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .reply-box {
      display: flex;
      align-items: flex-end;
      gap: var(--spacing-2);
    }
    .reply-box__text {
      flex: 1 1 auto;
      min-height: 38px;
      padding: 8px var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: 19px;
      background: var(--color-surface);
      color: var(--color-ink);
      font: inherit;
      resize: vertical;
    }
    .reply-box__text:focus-visible {
      border-color: var(--color-primary);
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 1px;
    }
    .reply-box__error {
      margin: 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostRepliesComponent {
  private readonly field = viewChild<ElementRef<HTMLTextAreaElement>>('field');

  readonly thread = input<ReplyThread | undefined>(undefined);
  readonly postAuthor = input('');
  readonly selfId = input<string | null>(null);
  readonly isModerator = input(false);
  readonly send = output<string>();
  readonly deleteReply = output<ReplyResponse>();
  readonly removeReply = output<ReplyResponse>();
  readonly retry = output<void>();
  readonly more = output<void>();

  protected readonly maxLength = REPLY_MAX_LENGTH;
  protected readonly fieldId = `reply-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly text = signal('');
  protected readonly tooLong = computed(() => this.text().length > REPLY_MAX_LENGTH);
  protected readonly canSend = computed(
    () => !!this.text().trim() && !this.tooLong() && !this.thread()?.sending,
  );

  constructor() {
    afterNextRender(() => this.field()?.nativeElement.focus());
  }

  /** Clears the reply box after a successful reply. */
  reset(): void {
    this.text.set('');
    const element = this.field()?.nativeElement;
    if (element) {
      element.value = '';
    }
  }

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  protected onEnter(event: Event): void {
    const keyboard = event as KeyboardEvent;
    if (!keyboard.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }

  protected submit(event?: Event): void {
    event?.preventDefault();
    if (this.canSend()) {
      this.send.emit(this.text().trim());
    }
  }
}
