import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { CreatePostRequest } from '@orenji/api-client';
import { CardImageComponent } from '../../../shared/catalog/card-image/card-image.component';
import { BinderLinkPickerComponent } from '../../../shared/links/binder-link-picker.component';
import { CardLinkPickerComponent } from '../../../shared/links/card-link-picker.component';
import { BinderLinkChoice, CardLinkChoice } from '../../../shared/links/link-choices';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { POST_MAX_LENGTH } from '../data/community-helpers';

type Picker = 'card' | 'binder' | null;

/**
 * "Write a post" card of a channel: text (1–2000 characters, inline validation), optional card and
 * public binder links picked through an autocomplete, and the Post button. Refusals from the
 * server (duplicate, rate limit, moderation) come back through `error`.
 */
@Component({
  selector: 'app-post-composer',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    AvatarComponent,
    BinderLinkPickerComponent,
    CardImageComponent,
    CardLinkPickerComponent,
  ],
  template: `
    <form class="composer" (submit)="submit($event)" [attr.aria-label]="'Post in ' + channelName()">
      <div class="composer__main">
        <app-avatar size="sm" [src]="avatarUrl()" [name]="displayName()" [decorative]="true" />
        <div class="composer__field">
          <label class="visually-hidden" [for]="textId">Post text</label>
          <textarea
            class="composer__text"
            [id]="textId"
            [formControl]="text"
            [placeholder]="'Share with ' + channelName() + '…'"
            [attr.maxlength]="maxLength"
            [attr.aria-invalid]="tooLong()"
            [attr.aria-describedby]="hintId"
            rows="3"
            (input)="length.set(text.value.length)"
            (keydown.control.enter)="submit()"
            (keydown.meta.enter)="submit()"
          ></textarea>
          <p class="composer__hint" [id]="hintId" [class.composer__hint--warn]="length() > maxLength - 200">
            @if (tooLong()) {
              Posts are limited to {{ maxLength }} characters.
            } @else if (length() > maxLength - 200) {
              {{ length() }} / {{ maxLength }}
            } @else {
              Be kind, no personal details. Ctrl+Enter posts.
            }
          </p>
        </div>
      </div>

      @switch (picker()) {
        @case ('card') {
          <app-card-link-picker (picked)="pickCard($event)" (cancelled)="picker.set(null)" />
        }
        @case ('binder') {
          <app-binder-link-picker (picked)="pickBinder($event)" (cancelled)="picker.set(null)" />
        }
      }

      @if (card(); as c) {
        <div class="chip" data-testid="post-attachment">
          <app-card-image class="chip__thumb" [src]="c.imageUrl" [game]="c.game ?? ''" alt="" />
          <span class="chip__text">{{ c.name }} @if (c.printingCode) {<span class="mono">· {{ c.printingCode }}</span>}</span>
          <button matIconButton type="button" aria-label="Remove the card" (click)="card.set(null)">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }
      @if (binder(); as b) {
        <div class="chip" data-testid="post-attachment">
          <mat-icon class="chip__icon" aria-hidden="true">menu_book</mat-icon>
          <span class="chip__text">{{ b.name }}</span>
          <button matIconButton type="button" aria-label="Remove the binder" (click)="binder.set(null)">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }

      @if (error()) {
        <p class="composer__error" role="alert" data-testid="post-error">{{ error() }}</p>
      }

      <div class="composer__actions">
        <button matButton type="button" (click)="open('card')">
          <mat-icon aria-hidden="true">playing_cards</mat-icon>
          Card
        </button>
        <button matButton type="button" (click)="open('binder')">
          <mat-icon aria-hidden="true">menu_book</mat-icon>
          Binder
        </button>
        <span class="composer__spacer"></span>
        <button matButton="filled" type="submit" [disabled]="!canPost()">
          <mat-icon aria-hidden="true">send</mat-icon>
          {{ busy() ? 'Posting…' : 'Post' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    :host {
      display: block;
    }
    .composer {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--elevation-menu);
    }
    .composer__main {
      display: flex;
      gap: var(--spacing-3);
    }
    .composer__field {
      flex: 1 1 auto;
      min-width: 0;
    }
    .composer__text {
      width: 100%;
      min-height: 76px;
      padding: var(--spacing-2) var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
      color: var(--color-ink);
      font: inherit;
      resize: vertical;
    }
    .composer__text:focus-visible {
      border-color: var(--color-primary);
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 1px;
    }
    .composer__text[aria-invalid='true'] {
      border-color: var(--color-danger);
    }
    .composer__hint {
      margin: var(--spacing-1) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .composer__hint--warn {
      color: var(--color-warning);
    }
    .composer__error {
      margin: 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    .composer__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-1);
    }
    .composer__spacer {
      flex: 1 1 auto;
    }
    .chip {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      padding: var(--spacing-1) var(--spacing-1) var(--spacing-1) var(--spacing-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
    }
    .chip__thumb {
      --card-image-shadow: none;
      flex: 0 0 28px;
      width: 28px;
    }
    .chip__icon {
      color: var(--color-primary);
    }
    .chip__text {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      font-weight: var(--font-weight-medium);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostComposerComponent {
  readonly channelName = input.required<string>();
  readonly displayName = input('');
  readonly avatarUrl = input<string | null | undefined>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly post = output<CreatePostRequest>();

  protected readonly maxLength = POST_MAX_LENGTH;
  protected readonly textId = `post-text-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly hintId = `${this.textId}-hint`;
  protected readonly text = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(POST_MAX_LENGTH)],
  });
  protected readonly length = signal(0);
  protected readonly picker = signal<Picker>(null);
  protected readonly card = signal<CardLinkChoice | null>(null);
  protected readonly binder = signal<BinderLinkChoice | null>(null);
  protected readonly tooLong = computed(() => this.length() > POST_MAX_LENGTH);
  private readonly hasText = signal(false);
  protected readonly canPost = computed(
    () => !this.busy() && this.length() > 0 && !this.tooLong() && this.hasText(),
  );

  constructor() {
    this.text.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.hasText.set(value.trim().length > 0));
  }

  /** Clears the composer after a successful post. */
  reset(): void {
    this.text.setValue('');
    this.length.set(0);
    this.card.set(null);
    this.binder.set(null);
    this.picker.set(null);
  }

  protected open(kind: Picker): void {
    this.picker.set(kind);
  }

  protected pickCard(card: CardLinkChoice): void {
    this.card.set(card);
    this.picker.set(null);
  }

  protected pickBinder(binder: BinderLinkChoice): void {
    this.binder.set(binder);
    this.picker.set(null);
  }

  protected submit(event?: Event): void {
    event?.preventDefault();
    if (!this.canPost()) {
      return;
    }
    this.post.emit({
      body: this.text.value.trim(),
      cardPrintingId: this.card()?.printingId,
      binderId: this.binder()?.binderId,
    });
  }
}
