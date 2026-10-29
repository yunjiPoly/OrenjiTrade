import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { ChatDrafts } from '../../../shared/messaging/chat-drafts.service';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { COMPOSER_COPY, QUICK_REPLIES } from '../data/chat-copy';
import { DraftAttachment, IMAGE_TYPES, MessageDraft, imageProblem } from '../data/message-draft';
import { MESSAGE_MAX_LENGTH } from '../data/message-text';

/** A row of the "+" menu that the chat answers with a dialog (spec 10.3). */
export type ComposerAction = 'address' | 'etransfer' | 'card' | 'binder';

/** Lines the field grows to before it scrolls (spec 10.3: 1 to 6 lines). */
const MAX_LINES = 6;
const LINE_PX = 21;

/**
 * The chat's composer (spec 10.3, boards W18 and W20): the quick-reply chips of the reader's side
 * above it; the round "+" menu ("Send my address" and "Send my e-Transfer email", typed each time
 * in their own dialog and never saved; "Send a photo"; "Share a card from your inventory"; "Share a
 * binder"); the field "Write a message" (radius 20, 1 to 6 lines; Enter or Ctrl/Cmd+Enter sends,
 * Shift+Enter adds a line); the round orange Send. A photo chosen or dropped attaches with its
 * preview. A failed send keeps the text and shows "Not sent" with "Try again". The draft of each
 * chat is kept in memory ({@link ChatDrafts}). It only emits; the chat decides whether a send
 * worked ({@link reset} clears the composer).
 */
@Component({
  selector: 'app-message-composer',
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatMenuModule, CardImageComponent],
  template: `
    <form class="composer" (submit)="submit($event)" [attr.aria-label]="copy.placeholder">
      @if (replies().length && !disabled()) {
        <div class="quick" role="group" [attr.aria-label]="quick.label">
          @for (reply of replies(); track reply) {
            <button
              type="button"
              class="quick__chip"
              [attr.aria-label]="quick.send(reply)"
              [attr.aria-disabled]="busy() ? 'true' : null"
              (click)="onQuick(reply)"
            >
              {{ reply }}
            </button>
          }
        </div>
      }

      @if (attachment(); as a) {
        <div class="attachment" data-testid="composer-attachment">
          @switch (a.kind) {
            @case ('card') {
              <app-card-image
                class="attachment__thumb"
                [src]="a.card.imageUrl"
                [game]="a.card.game"
                [alt]="a.card.name"
              />
              <span class="attachment__text">
                <span class="attachment__eyebrow">Card</span>
                <span class="attachment__name">{{ a.card.name }}</span>
              </span>
            }
            @case ('item') {
              <span class="attachment__text">
                <span class="attachment__eyebrow">Your card</span>
                <span class="attachment__name">{{ a.name }}</span>
              </span>
            }
            @case ('binder') {
              <span class="attachment__text">
                <span class="attachment__eyebrow">Public binder</span>
                <span class="attachment__name">{{ a.binder.name }}</span>
              </span>
            }
            @case ('image') {
              <img class="attachment__photo" [src]="a.previewUrl" [alt]="copy.photoToSend" />
              <span class="attachment__text">
                <span class="attachment__eyebrow">Photo</span>
                <span class="attachment__name">{{ a.file.name }}</span>
                <span class="attachment__meta">{{ size(a.file.size) }}</span>
              </span>
            }
          }
          <button
            matIconButton
            type="button"
            class="attachment__remove"
            [attr.aria-label]="copy.removeAttachment"
            (click)="clearAttachment()"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }

      @if (fileError()) {
        <p class="composer__error" role="alert">{{ fileError() }}</p>
      }
      @if (error()) {
        <p class="composer__error composer__failed" role="alert" data-testid="send-error">
          <mat-icon aria-hidden="true">error</mat-icon>
          <span
            ><strong>{{ copy.notSent }}</strong> · {{ error() }}</span
          >
          @if (canRetry()) {
            <button type="button" class="composer__retry" (click)="tryAgain()">
              {{ copy.tryAgain }}
            </button>
          }
        </p>
      }

      <div class="composer__row">
        <button
          type="button"
          class="composer__plus"
          [attr.aria-label]="copy.plus"
          aria-haspopup="menu"
          [matMenuTriggerFor]="plusMenu"
          [disabled]="disabled()"
          data-testid="composer-plus"
        >
          <mat-icon aria-hidden="true">add</mat-icon>
        </button>
        <mat-menu
          #plusMenu="matMenu"
          yPosition="above"
          [class]="layout.narrow() ? 'plus-menu app-menu--sheet' : 'plus-menu'"
          [backdropClass]="
            layout.narrow() ? 'cdk-overlay-dark-backdrop' : 'cdk-overlay-transparent-backdrop'
          "
        >
          <button
            mat-menu-item
            type="button"
            class="plus-menu__item"
            (click)="action.emit('address')"
          >
            <mat-icon aria-hidden="true">package_2</mat-icon>
            <span class="plus-menu__text">
              <span>{{ copy.address }}</span>
              <small>{{ copy.typedEachTime }}</small>
            </span>
          </button>
          <button
            mat-menu-item
            type="button"
            class="plus-menu__item"
            (click)="action.emit('etransfer')"
          >
            <mat-icon aria-hidden="true">mail</mat-icon>
            <span class="plus-menu__text">
              <span>{{ copy.etransfer }}</span>
              <small>{{ copy.typedEachTime }}</small>
            </span>
          </button>
          <div class="plus-menu__divider" role="separator"></div>
          <button mat-menu-item type="button" class="plus-menu__item" (click)="chooseFile()">
            <mat-icon aria-hidden="true">add_photo_alternate</mat-icon>
            <span class="plus-menu__text">
              <span>{{ copy.photo }}</span>
              <small>{{ copy.photoDetail }}</small>
            </span>
          </button>
          <button mat-menu-item type="button" (click)="action.emit('card')">
            <mat-icon aria-hidden="true">playing_cards</mat-icon>
            {{ copy.card }}
          </button>
          <button mat-menu-item type="button" (click)="action.emit('binder')">
            <mat-icon aria-hidden="true">menu_book</mat-icon>
            {{ copy.binder }}
          </button>
        </mat-menu>
        <input
          #fileInput
          class="visually-hidden"
          type="file"
          tabindex="-1"
          aria-hidden="true"
          [accept]="accept"
          (change)="onFile($event)"
        />

        <label class="visually-hidden" [for]="textId">Message</label>
        <textarea
          #textarea
          class="composer__text"
          [id]="textId"
          [formControl]="text"
          [placeholder]="placeholder()"
          [attr.aria-describedby]="counterId"
          [attr.maxlength]="maxLength"
          [attr.aria-disabled]="disabled() ? 'true' : null"
          [readOnly]="disabled()"
          rows="1"
          (keydown)="onKeydown($event)"
          (input)="onInput()"
        ></textarea>

        <button
          type="submit"
          class="composer__send"
          aria-label="Send message"
          [class.composer__send--ready]="canSend()"
          [disabled]="!canSend()"
        >
          <mat-icon aria-hidden="true">send</mat-icon>
        </button>
      </div>
      <p class="composer__counter" [id]="counterId" [class.composer__counter--warn]="nearLimit()">
        @if (nearLimit()) {
          {{ copy.nearLimit(length(), maxLength) }}
        } @else {
          {{ copy.hint }}
        }
      </p>
    </form>
  `,
  styleUrl: './message-composer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageComposerComponent {
  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly drafts = inject(ChatDrafts);
  /** Below 960 the "+" menu is a bottom sheet (spec 16). */
  protected readonly layout = inject(ShellLayout);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly view = inject(DOCUMENT).defaultView;

  /** Sending in progress. */
  readonly busy = input(false);
  /** The chat cannot receive messages (a block, an inactive collector). */
  readonly disabled = input(false);
  /** Why the last send failed (from the chat). */
  readonly error = input<string | null>(null);
  /**
   * The error is a quick reply's, not the field's draft: "Try again" asks the chat to send that
   * reply again ({@link retry}) instead of the field's text (WC review F6, U10).
   */
  readonly retryReply = input(false);
  readonly placeholder = input<string>(COMPOSER_COPY.placeholder);
  /** The chat whose draft this composer edits (kept per chat in memory). */
  readonly draftKey = input<string | null>(null);
  /** The quick replies of the reader's side ({@link quickReplies}). */
  readonly replies = input<readonly string[]>([]);
  readonly send = output<MessageDraft>();
  /** A quick reply was chosen: the chat sends it as it is. */
  readonly quickReply = output<string>();
  /** "Try again" of a failed quick reply. */
  readonly retry = output<void>();
  /** A "+" row the chat answers with its dialog. */
  readonly action = output<ComposerAction>();
  /** The caller typed (throttled by the thread before it reaches the server). */
  readonly typing = output<void>();

  protected readonly copy = COMPOSER_COPY;
  protected readonly quick = QUICK_REPLIES;
  protected readonly maxLength = MESSAGE_MAX_LENGTH;
  protected readonly accept = IMAGE_TYPES.join(',');
  protected readonly textId = `composer-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly counterId = `${this.textId}-counter`;
  protected readonly text = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(MESSAGE_MAX_LENGTH)],
  });
  protected readonly attachment = signal<DraftAttachment | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly length = signal(0);
  protected readonly nearLimit = computed(() => this.length() > MESSAGE_MAX_LENGTH - 200);
  private readonly hasText = signal(false);
  protected readonly canSend = computed(
    () =>
      !this.busy() &&
      !this.disabled() &&
      (this.hasText() || !!this.attachment()) &&
      this.length() <= MESSAGE_MAX_LENGTH,
  );

  protected readonly canRetry = computed(() =>
    this.retryReply() ? !this.busy() && !this.disabled() : this.canSend(),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revokePreview());
    // Another chat: its own draft (spec 10.6), and no attachment carried over.
    effect(() => {
      const key = this.draftKey();
      untracked(() => {
        this.clearAttachment();
        this.fileError.set(null);
        this.text.setValue(this.drafts.get(key));
        this.onInput(false);
      });
    });
  }

  /** Clears the text, its draft and the attachment (after a successful send). */
  reset(): void {
    this.text.setValue('');
    this.drafts.clear(this.draftKey());
    this.onInput(false);
    this.clearAttachment();
    this.focus();
  }

  focus(): void {
    this.textarea()?.nativeElement.focus();
  }

  /** Puts a text in the field (a "More from" tile's question), ready to send. */
  prefill(text: string): void {
    this.text.setValue(text);
    this.onInput(false);
    const element = this.textarea()?.nativeElement;
    if (element) {
      element.focus();
      element.setSelectionRange(text.length, text.length);
    }
  }

  /**
   * Attaches a card or binder chosen in the "+" menu's picker: it waits in the message box with
   * its preview and "Remove attachment", and goes with Send (with any text typed).
   */
  attach(attachment: Exclude<DraftAttachment, { kind: 'image' }>): void {
    this.fileError.set(null);
    this.setAttachment(attachment);
    this.focus();
  }

  /** Opens the file chooser ("Send a photo"). */
  chooseFile(): void {
    this.fileInput()?.nativeElement.click();
  }

  /** Attaches a photo chosen or dropped on the chat; `false` with the reason shown when not. */
  attachFile(file: File): boolean {
    const problem = imageProblem(file);
    if (problem) {
      this.fileError.set(problem);
      return false;
    }
    this.fileError.set(null);
    this.setAttachment({ kind: 'image', file, previewUrl: URL.createObjectURL(file) });
    this.focus();
    return true;
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      this.attachFile(file);
    }
  }

  protected clearAttachment(): void {
    this.revokePreview();
    this.attachment.set(null);
  }

  protected onInput(typed = true): void {
    const value = this.text.value;
    this.length.set(value.length);
    this.hasText.set(value.trim().length > 0);
    if (typed) {
      this.drafts.set(this.draftKey(), value);
    }
    const element = this.textarea()?.nativeElement;
    if (element) {
      element.style.height = 'auto';
      const max = MAX_LINES * LINE_PX + 20;
      element.style.height = `${Math.min(Math.max(element.scrollHeight, 40), max)}px`;
      // A short window scrolls the chat's column: the whole composer, its counter included,
      // stays in view while the field grows (WC review A5).
      if (typed && this.shortWindow()) {
        this.host.nativeElement.scrollIntoView({ block: 'nearest' });
      }
    }
    if (value && typed) {
      this.typing.emit();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) {
      return;
    }
    // Enter sends, Ctrl/Cmd+Enter sends too (spec 4.9); Shift+Enter alone adds a line.
    if (!event.shiftKey || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      this.submit();
    }
  }

  protected submit(event?: Event): void {
    event?.preventDefault();
    if (!this.canSend()) {
      return;
    }
    this.send.emit({ text: this.text.value, attachment: this.attachment() });
  }

  /** A chip stays focusable while a message is on its way (`aria-disabled`; WC review A1). */
  protected onQuick(reply: string): void {
    if (!this.busy()) {
      this.quickReply.emit(reply);
    }
  }

  /** The window is short (a 200 percent zoom): the chat's column scrolls (spec 16). */
  private shortWindow(): boolean {
    return !!this.view?.matchMedia?.('(max-height: 560px)').matches;
  }

  protected tryAgain(): void {
    if (this.retryReply()) {
      this.retry.emit();
    } else {
      this.submit();
    }
  }

  protected size(bytes: number): string {
    return bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  private setAttachment(attachment: DraftAttachment): void {
    this.revokePreview();
    this.attachment.set(attachment);
  }

  private revokePreview(): void {
    const current = this.attachment();
    if (current?.kind === 'image') {
      URL.revokeObjectURL(current.previewUrl);
    }
  }
}
