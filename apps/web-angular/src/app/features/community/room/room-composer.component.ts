import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { ChatDrafts } from '../../../shared/messaging/chat-drafts.service';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { ROOM_COMPOSER_COPY, ROOM_COPY } from '../data/community-copy';
import { POST_MAX_LENGTH, POST_NEAR_LIMIT, RoomAttachment, canPost } from '../data/community-rules';

/** What the message box hands to the room when the collector posts. */
export interface RoomDraft {
  text: string;
  attachment: RoomAttachment | null;
}

/**
 * The message box of a room (spec 10.7, board W22): "+" (40 round) opens "Share a card" and
 * "Share a binder or deck core" (no photo: community photos are stage S4); what was added waits
 * above the field, removable; the field "Write to the room" grows from 1 to 6 lines; the post
 * button (40 round) turns orange with text (a post always has text). Enter posts, Shift+Enter
 * makes a new line. A refusal shows under it in the phone's words, with "Try again" after a
 * network error. The text is kept per room while the page is open (in memory only).
 */
@Component({
  selector: 'app-room-composer',
  imports: [ReactiveFormsModule, MatMenuModule, CardImageComponent, ShellIconComponent],
  template: `
    <form class="rc" (submit)="submit($event)" [attr.aria-label]="copy.field(roomName())">
      @if (attachment(); as a) {
        <div class="rc__tray" role="group" [attr.aria-label]="copy.tray">
          <span class="rc__chip" [class.rc__chip--core]="a.kind === 'binder' && a.deckCore">
            @if (a.kind === 'card') {
              <span class="rc__art" aria-hidden="true">
                <app-card-image size="fill" [src]="a.card.imageUrl" [game]="a.card.game" alt="" />
              </span>
              <span class="rc__chip-text">
                <span class="rc__chip-name">{{ a.card.name }}</span>
                @if (a.card.printingCode) {
                  <span class="rc__chip-line rc__chip-line--mono">{{ a.card.printingCode }}</span>
                }
              </span>
            } @else {
              <span class="rc__binder" aria-hidden="true">
                <app-shell-icon [name]="a.deckCore ? 'layers' : 'binder'" [size]="20" />
              </span>
              <span class="rc__chip-text">
                <span class="rc__chip-name">{{ a.binder.name }}</span>
                <span class="rc__chip-line">{{ binderLine(a) }}</span>
              </span>
            }
            <button
              type="button"
              class="rc__remove"
              [attr.aria-label]="copy.remove(a.kind === 'card' ? a.card.name : a.binder.name)"
              (click)="removeAttachment()"
            >
              <app-shell-icon name="close" [size]="16" [stroke]="2.2" />
            </button>
          </span>
        </div>
      }
      <div class="rc__row">
        <button
          #plus
          type="button"
          class="rc__plus"
          data-testid="room-plus"
          [attr.aria-label]="copy.add"
          [attr.title]="copy.addTitle"
          aria-haspopup="menu"
          [matMenuTriggerFor]="plusMenu"
        >
          <app-shell-icon name="plus" [size]="20" [stroke]="2.2" />
        </button>
        <mat-menu
          #plusMenu="matMenu"
          yPosition="above"
          [class]="layout.narrow() ? 'plus-menu app-menu--sheet' : 'plus-menu'"
          [backdropClass]="
            layout.narrow() ? 'cdk-overlay-dark-backdrop' : 'cdk-overlay-transparent-backdrop'
          "
        >
          <button mat-menu-item type="button" (click)="share.emit('card')">
            <span class="rc__menu-row">
              <app-shell-icon name="inventory" [size]="20" />
              {{ copy.card }}
            </span>
          </button>
          <button mat-menu-item type="button" (click)="share.emit('binder')">
            <span class="rc__menu-row">
              <app-shell-icon name="binder" [size]="20" />
              {{ copy.binder }}
            </span>
          </button>
        </mat-menu>

        <label class="visually-hidden" [for]="fieldId">{{ copy.field(roomName()) }}</label>
        <textarea
          #field
          class="rc__field"
          data-testid="room-field"
          [id]="fieldId"
          [formControl]="text"
          [placeholder]="copy.placeholder"
          [attr.aria-describedby]="hintId"
          [attr.maxlength]="maxLength"
          rows="1"
          (keydown)="onKeydown($event)"
          (input)="onInput()"
        ></textarea>

        <button
          type="submit"
          class="rc__post"
          data-testid="room-post-button"
          [class.rc__post--ready]="ready()"
          [attr.aria-label]="copy.post(roomName())"
          [attr.aria-disabled]="ready() ? null : 'true'"
          title="Post · Enter"
        >
          <app-shell-icon name="send" [size]="18" />
        </button>
      </div>
      @if (error(); as message) {
        <p class="rc__error" role="alert" data-testid="room-post-error">
          <app-shell-icon name="alert" [size]="16" />
          <span>{{ message }}</span>
          @if (retryable()) {
            <button type="button" class="rc__retry" (click)="retry.emit()">
              {{ copy.tryAgain }}
            </button>
          }
        </p>
      }
      <p class="rc__hint" [id]="hintId" [class.rc__hint--warn]="nearLimit()">
        @if (length() > maxLength) {
          {{ copy.tooLong(maxLength) }}
        } @else if (nearLimit()) {
          {{ copy.nearLimit(length(), maxLength) }}
        } @else {
          {{ copy.hint }}
        }
      </p>
    </form>
  `,
  styleUrl: './room-composer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomComposerComponent {
  private readonly drafts = inject(ChatDrafts);
  protected readonly layout = inject(ShellLayout);
  private readonly field = viewChild<ElementRef<HTMLTextAreaElement>>('field');
  private readonly plus = viewChild<ElementRef<HTMLButtonElement>>('plus');

  /** The room's name ("Yu-Gi-Oh!") for the field's and the button's names. */
  readonly roomName = input.required<string>();
  /** The room's slug: its draft is kept while the page is open. */
  readonly slug = input.required<string>();
  /** Posting in progress. */
  readonly busy = input(false);
  /** Why the last post was refused. */
  readonly error = input<string | null>(null);
  /** The refusal was a network error: "Try again" sends the same post again. */
  readonly retryable = input(false);
  readonly post = output<RoomDraft>();
  readonly retry = output<void>();
  readonly share = output<'card' | 'binder'>();
  /** The field changed (the room clears a refusal that no longer applies). */
  readonly edited = output<void>();

  protected readonly copy = ROOM_COMPOSER_COPY;
  protected readonly maxLength = POST_MAX_LENGTH;
  protected readonly fieldId = `room-field-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly hintId = `${this.fieldId}-hint`;
  protected readonly text = new FormControl('', { nonNullable: true });
  protected readonly length = signal(0);
  private readonly value = signal('');
  protected readonly attachment = signal<RoomAttachment | null>(null);
  protected readonly ready = computed(() => canPost(this.value(), this.busy()));
  protected readonly nearLimit = computed(() => this.length() >= POST_NEAR_LIMIT);

  constructor() {
    // Another room: its own draft comes back, the attachment goes.
    effect(() => {
      const slug = this.slug();
      untracked(() => {
        this.text.setValue(this.drafts.get(draftKey(slug)));
        this.attachment.set(null);
        this.sync(false);
      });
    });
  }

  /** What the share picker chose waits above the field. */
  attach(attachment: RoomAttachment): void {
    this.attachment.set(attachment);
    this.focus();
  }

  focus(): void {
    this.field()?.nativeElement.focus();
  }

  focusPlus(): void {
    this.plus()?.nativeElement.focus();
  }

  /** The post is in the room: the field, its draft and the attachment are cleared. */
  reset(): void {
    this.text.setValue('');
    this.drafts.set(draftKey(this.slug()), '');
    this.attachment.set(null);
    this.sync(false);
    this.focus();
  }

  protected removeAttachment(): void {
    this.attachment.set(null);
    this.focus();
  }

  protected binderLine(attachment: Extract<RoomAttachment, { kind: 'binder' }>): string {
    return attachment.deckCore
      ? [ROOM_COPY.deckCore, attachment.price].filter(Boolean).join(' · ')
      : ROOM_COPY.publicBinder;
  }

  protected onInput(): void {
    this.sync(true);
    this.edited.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) {
      return;
    }
    // Enter posts (Ctrl/Cmd+Enter too); Shift+Enter alone adds a line.
    if (!event.shiftKey || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      this.submit();
    }
  }

  protected submit(event?: Event): void {
    event?.preventDefault();
    if (!this.ready()) {
      this.focus();
      return;
    }
    this.post.emit({ text: this.text.value, attachment: this.attachment() });
  }

  private sync(typed: boolean): void {
    const value = this.text.value;
    this.value.set(value);
    this.length.set(value.length);
    if (typed) {
      this.drafts.set(draftKey(this.slug()), value);
    }
    const element = this.field()?.nativeElement;
    if (element) {
      // 1 to 6 lines (spec 10.3's field, board W22).
      element.style.height = 'auto';
      const max = 6 * 22 + 18;
      element.style.height = `${Math.min(Math.max(element.scrollHeight, 40), max)}px`;
      element.style.overflowY = element.scrollHeight > max ? 'auto' : 'hidden';
    }
  }
}

/** The key of a room's draft among the chats' drafts (in memory; forgotten on sign-out). */
function draftKey(slug: string): string {
  return `room:${slug}`;
}
