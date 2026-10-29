import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { BinderImage } from '@orenji/api-client';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';

/**
 * A deck core's photos (spec 8.1 and 6.5, boards W5 and W8): the main photo contained on
 * `photoBackdrop` (680×510 on the page, 472×354 beside Search's list), "1 / 4", ← and → buttons
 * (the arrow keys too, on the gallery), up to 4 thumbnails, and "View full size", a lightbox at the
 * photo's own size (user photos, not card art); Esc closes it and the focus returns.
 */
@Component({
  selector: 'app-deck-core-gallery',
  imports: [ShellIconComponent],
  template: `
    <div
      class="gal"
      [class.gal--compact]="compact()"
      role="group"
      aria-roledescription="gallery"
      [attr.aria-label]="'Photos of ' + name()"
      tabindex="0"
      (keydown)="onKeydown($event)"
    >
      <div class="gal__main">
        @if (current(); as photo) {
          <img class="gal__img" [src]="photo.url" [alt]="photoAlt(index())" decoding="async" />
        } @else {
          <span class="gal__none">No photos yet</span>
        }
        @if (photos().length > 1) {
          <span class="gal__count" aria-live="polite">{{ index() + 1 }} / {{ photos().length }}</span>
          <button type="button" class="gal__nav gal__nav--prev" aria-label="Previous photo" (click)="move(-1)">
            <app-shell-icon name="chevronLeft" [size]="20" />
          </button>
          <button type="button" class="gal__nav gal__nav--next" aria-label="Next photo" (click)="move(1)">
            <app-shell-icon name="chevronRight" [size]="20" />
          </button>
        }
        @if (current() && !compact()) {
          <button type="button" class="gal__full" (click)="openLightbox($event)">
            <app-shell-icon name="expand" [size]="16" />
            View full size
          </button>
        }
      </div>
      @if (photos().length > 1) {
        <div class="gal__thumbs">
          <div class="gal__thumb-row" role="group" aria-label="Choose a photo">
            @for (photo of photos().slice(0, 4); track photo.id; let i = $index) {
              <button
                type="button"
                class="gal__thumb"
                [attr.aria-current]="i === index() ? 'true' : null"
                [attr.aria-label]="'Photo ' + (i + 1) + ' of ' + photos().length"
                (click)="index.set(i)"
              >
                <img [src]="photo.url" alt="" loading="lazy" decoding="async" />
              </button>
            }
          </div>
          @if (!compact()) {
            <span class="gal__keys" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd> to switch photos</span>
          }
        </div>
      }
    </div>
    <dialog #lightbox class="gal__lightbox" aria-label="Photo at full size" (close)="onLightboxClose()" (click)="onLightboxClick($event)">
      @if (current(); as photo) {
        <img [src]="photo.url" [alt]="photoAlt(index())" />
      }
      <button type="button" class="gal__lb-close" aria-label="Close" (click)="lightbox.close()">
        <app-shell-icon name="close" [size]="20" />
      </button>
    </dialog>
  `,
  styles: `
    :host {
      display: block;
    }
    .gal {
      display: flex;
      flex-direction: column;
      gap: 12px;
      border-radius: var(--radius-lg);
      outline: none;
    }
    .gal:focus-visible {
      box-shadow: 0 0 0 2px var(--color-accent);
    }
    .gal__main {
      position: relative;
      display: grid;
      place-items: center;
      width: 100%;
      aspect-ratio: 4 / 3;
      overflow: hidden;
      border-radius: var(--radius-lg);
      background: var(--color-photo-backdrop);
    }
    .gal__img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .gal__none {
      color: #a8a29e;
      font-size: var(--font-size-sm);
    }
    .gal__count {
      position: absolute;
      top: 12px;
      right: 12px;
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      background: rgba(13, 12, 11, 0.72);
      color: #fafaf9;
      font-size: var(--font-size-meta);
      font-weight: var(--font-weight-semibold);
    }
    .gal__nav {
      position: absolute;
      top: 50%;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      margin-top: -22px;
      border: 0;
      border-radius: 50%;
      background: rgba(13, 12, 11, 0.72);
      color: #fafaf9;
      cursor: pointer;
    }
    .gal__nav--prev {
      left: 12px;
    }
    .gal__nav--next {
      right: 12px;
    }
    .gal__full {
      position: absolute;
      right: 12px;
      bottom: 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 12px;
      border: 0;
      border-radius: var(--radius-pill);
      background: rgba(13, 12, 11, 0.72);
      color: #fafaf9;
      font: inherit;
      font-size: var(--font-size-meta);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .gal__thumbs {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .gal__thumb-row {
      display: flex;
      gap: 8px;
    }
    .gal__thumb {
      width: 88px;
      height: 66px;
      padding: 0;
      overflow: hidden;
      border: 2px solid transparent;
      border-radius: var(--radius-md);
      background: var(--color-photo-backdrop);
      cursor: pointer;
    }
    .gal--compact .gal__thumb {
      width: 64px;
      height: 48px;
    }
    .gal__thumb[aria-current='true'] {
      border-color: var(--color-ink);
    }
    .gal__thumb img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .gal__keys {
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
    }
    .gal__keys kbd {
      margin-right: 4px;
      padding: 0 5px;
      border: 1px solid var(--color-border-input);
      border-radius: 4px;
      font-family: inherit;
      font-size: var(--font-size-xs);
    }
    .gal__lightbox {
      max-width: 96vw;
      max-height: 92vh;
      padding: 0;
      border: 0;
      border-radius: var(--radius-lg);
      background: var(--color-photo-backdrop);
    }
    .gal__lightbox::backdrop {
      background: var(--color-overlay);
    }
    .gal__lightbox img {
      display: block;
      max-width: 96vw;
      max-height: 92vh;
    }
    .gal__lb-close {
      position: absolute;
      top: 12px;
      right: 12px;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 50%;
      background: rgba(13, 12, 11, 0.72);
      color: #fafaf9;
      cursor: pointer;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckCoreGalleryComponent {
  readonly photos = input<readonly BinderImage[]>([]);
  readonly name = input('');
  /** Beside Search's list (472, thumbnails of 64, no lightbox). */
  readonly compact = input(false);

  protected readonly index = signal(0);
  protected readonly current = computed(() => this.photos()[this.index()] ?? this.photos()[0] ?? null);
  private readonly lightbox = viewChild.required<ElementRef<HTMLDialogElement>>('lightbox');
  private opener: HTMLElement | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.lightbox()?.nativeElement.close?.());
  }

  protected photoAlt(index: number): string {
    return `${this.name()}, photo ${index + 1} of ${this.photos().length}`;
  }

  protected move(step: number): void {
    const count = this.photos().length;
    if (count > 1) {
      this.index.set((this.index() + step + count) % count);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.move(event.key === 'ArrowLeft' ? -1 : 1);
    }
  }

  protected openLightbox(event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    const dialog = this.lightbox().nativeElement;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
  }

  protected onLightboxClick(event: MouseEvent): void {
    if (event.target === this.lightbox().nativeElement) {
      this.lightbox().nativeElement.close();
    }
  }

  protected onLightboxClose(): void {
    this.opener?.focus();
  }
}
