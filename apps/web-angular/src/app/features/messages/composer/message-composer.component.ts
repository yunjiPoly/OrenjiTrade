import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BinderLinkPickerComponent } from '../../../shared/links/binder-link-picker.component';
import { CardLinkPickerComponent } from '../../../shared/links/card-link-picker.component';
import { BinderLinkChoice, CardLinkChoice } from '../../../shared/links/link-choices';
import {
  OfferLinkChoice,
  OfferLinkPickerComponent,
} from '../../../shared/offers/offer-link-picker.component';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { DraftAttachment, IMAGE_TYPES, MessageDraft, imageProblem } from '../data/message-draft';
import { MESSAGE_MAX_LENGTH } from '../data/message-text';

type Picker = 'card' | 'binder' | 'offer' | null;

/**
 * Message composer: multi-line text (Enter sends, Shift+Enter adds a line), an attachment menu
 * (share a card or one of the caller's public binders through an autocomplete, or attach a photo
 * with preview and type/size validation) and the send button. It only emits drafts; the thread
 * decides whether the send succeeded ({@link reset} clears the composer).
 */
@Component({
  selector: 'app-message-composer',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    BinderLinkPickerComponent,
    CardImageComponent,
    CardLinkPickerComponent,
    OfferLinkPickerComponent,
  ],
  template: `
    <form class="composer" (submit)="submit($event)" aria-label="Write a message">
      @switch (picker()) {
        @case ('card') {
          <app-card-link-picker (picked)="pickCard($event)" (cancelled)="closePicker()" />
        }
        @case ('binder') {
          <app-binder-link-picker (picked)="pickBinder($event)" (cancelled)="closePicker()" />
        }
        @case ('offer') {
          @if (otherId(); as otherId) {
            <app-offer-link-picker
              [otherId]="otherId"
              [otherName]="otherName()"
              (picked)="pickOffer($event)"
              (cancelled)="closePicker()"
            />
          }
        }
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
                @if (a.card.printingCode) {
                  <span class="attachment__meta mono">{{ a.card.printingCode }}</span>
                }
              </span>
            }
            @case ('binder') {
              <span class="attachment__icon" aria-hidden="true"
                ><mat-icon>menu_book</mat-icon></span
              >
              <span class="attachment__text">
                <span class="attachment__eyebrow">Public binder</span>
                <span class="attachment__name">{{ a.binder.name }}</span>
              </span>
            }
            @case ('offer') {
              <app-card-image
                class="attachment__thumb"
                [src]="a.offer.imageUrl"
                [game]="a.offer.game"
                [alt]="a.offer.cardName"
              />
              <span class="attachment__text">
                <span class="attachment__eyebrow">Offer</span>
                <span class="attachment__name">{{ a.offer.cardName }}</span>
                <span class="attachment__meta">{{ a.offer.terms }}</span>
              </span>
            }
            @case ('image') {
              <img class="attachment__photo" [src]="a.previewUrl" alt="Photo to send" />
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
            aria-label="Remove attachment"
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
        <p class="composer__error" role="alert" data-testid="send-error">{{ error() }}</p>
      }

      <div class="composer__row">
        <button
          matIconButton
          type="button"
          aria-label="Attach a card, binder, offer or photo"
          matTooltip="Attach"
          [matMenuTriggerFor]="attachMenu"
          [disabled]="disabled()"
        >
          <mat-icon>add_circle</mat-icon>
        </button>
        <mat-menu #attachMenu="matMenu">
          <button mat-menu-item type="button" (click)="openPicker('card')">
            <mat-icon aria-hidden="true">playing_cards</mat-icon>
            Share a card
          </button>
          <button mat-menu-item type="button" (click)="openPicker('binder')">
            <mat-icon aria-hidden="true">menu_book</mat-icon>
            Share a binder
          </button>
          @if (otherId()) {
            <button mat-menu-item type="button" (click)="openPicker('offer')">
              <mat-icon aria-hidden="true">local_offer</mat-icon>
              Share an offer
            </button>
          }
          <button mat-menu-item type="button" (click)="fileInput.click()">
            <mat-icon aria-hidden="true">add_photo_alternate</mat-icon>
            Attach a photo
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
          rows="1"
          (keydown)="onKeydown($event)"
          (input)="onInput()"
        ></textarea>

        <button
          matIconButton
          type="submit"
          class="composer__send"
          aria-label="Send message"
          [disabled]="!canSend()"
        >
          <mat-icon>send</mat-icon>
        </button>
      </div>
      <p class="composer__counter" [id]="counterId" [class.composer__counter--warn]="nearLimit()">
        @if (nearLimit()) {
          {{ length() }} / {{ maxLength }} characters
        } @else {
          <span class="visually-hidden">Enter to send, Shift+Enter for a new line.</span>
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

  /** Sending in progress, or the conversation cannot receive messages. */
  readonly busy = input(false);
  readonly disabled = input(false);
  /** Error of the last send (from the thread). */
  readonly error = input<string | null>(null);
  readonly placeholder = input('Write a message');
  /** The other participant ("Share an offer" lists the negotiations with them). */
  readonly otherId = input<string | null>(null);
  readonly otherName = input('this collector');
  readonly send = output<MessageDraft>();
  /** The caller typed (throttled by the thread before it reaches the server). */
  readonly typing = output<void>();

  protected readonly maxLength = MESSAGE_MAX_LENGTH;
  protected readonly accept = IMAGE_TYPES.join(',');
  protected readonly textId = `composer-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly counterId = `${this.textId}-counter`;
  protected readonly text = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(MESSAGE_MAX_LENGTH)],
  });
  protected readonly picker = signal<Picker>(null);
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

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revokePreview());
  }

  /** Clears the text and the attachment (after a successful send). */
  reset(): void {
    this.text.setValue('');
    this.onInput();
    this.clearAttachment();
    this.textarea()?.nativeElement.focus();
  }

  focus(): void {
    this.textarea()?.nativeElement.focus();
  }

  protected openPicker(kind: Picker): void {
    this.fileError.set(null);
    this.picker.set(kind);
  }

  protected closePicker(): void {
    this.picker.set(null);
    this.focus();
  }

  protected pickCard(card: CardLinkChoice): void {
    this.setAttachment({ kind: 'card', card });
    this.closePicker();
  }

  protected pickBinder(binder: BinderLinkChoice): void {
    this.setAttachment({ kind: 'binder', binder });
    this.closePicker();
  }

  protected pickOffer(offer: OfferLinkChoice): void {
    this.setAttachment({ kind: 'offer', offer });
    this.closePicker();
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const problem = imageProblem(file);
    if (problem) {
      this.fileError.set(problem);
      return;
    }
    this.fileError.set(null);
    this.picker.set(null);
    this.setAttachment({ kind: 'image', file, previewUrl: URL.createObjectURL(file) });
    this.focus();
  }

  protected clearAttachment(): void {
    this.revokePreview();
    this.attachment.set(null);
  }

  protected onInput(): void {
    const value = this.text.value;
    this.length.set(value.length);
    this.hasText.set(value.trim().length > 0);
    const element = this.textarea()?.nativeElement;
    if (element) {
      element.style.height = 'auto';
      element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
    }
    if (value) {
      this.typing.emit();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
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

  /** Opens the file chooser (tests, keyboard shortcut). */
  chooseFile(): void {
    this.fileInput()?.nativeElement.click();
  }
}
