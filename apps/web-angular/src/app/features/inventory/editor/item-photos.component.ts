import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { InventoryItemImage } from '@orenji/api-client';

export const ITEM_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const ITEM_PHOTO_MAX_COUNT = 4;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Client-side check before uploading (the API re-checks and re-encodes). */
export function validateItemPhoto(file: Pick<File, 'type' | 'size'>): string | null {
  if (!PHOTO_TYPES.includes(file.type)) {
    return 'Use a JPEG, PNG or WebP photo.';
  }
  if (file.size === 0) {
    return 'That file is empty.';
  }
  return file.size > ITEM_PHOTO_MAX_BYTES ? 'Choose a photo smaller than 8 MB.' : null;
}

/** Owner photos of an item (up to four): thumbnails with remove buttons and an add button. */
@Component({
  selector: 'app-item-photos',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="ph">
      <ul class="ph__list" aria-label="Photos">
        @for (image of images(); track image.id; let i = $index) {
          <li class="ph__item">
            <img class="ph__img" [src]="image.url" [alt]="'Photo ' + (i + 1)" loading="lazy" />
            <button
              matIconButton
              type="button"
              class="ph__remove"
              [disabled]="busy()"
              [attr.aria-label]="'Remove photo ' + (i + 1)"
              (click)="remove.emit(image.id)"
            >
              <mat-icon>close</mat-icon>
            </button>
          </li>
        }
        @if (canAdd()) {
          <li class="ph__item ph__item--add">
            <label class="ph__add" [class.ph__add--busy]="busy()">
              <mat-icon aria-hidden="true">{{ busy() ? 'hourglass_top' : 'add_a_photo' }}</mat-icon>
              <span>{{ busy() ? 'Uploading…' : 'Add photo' }}</span>
              <input
                class="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                [disabled]="busy()"
                (change)="onFile($event)"
              />
            </label>
          </li>
        }
      </ul>
      <p class="ph__hint">
        Up to {{ maxCount }} photos (JPEG, PNG or WebP, 8 MB). Location data is removed from photos.
      </p>
      @if (message(); as message) {
        <p class="ph__error" role="alert">{{ message }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .ph__list {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--spacing-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .ph__item {
      position: relative;
      aspect-ratio: 1;
      border-radius: var(--radius-md);
      overflow: hidden;
      background: var(--color-surface-variant);
    }
    .ph__img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .ph__remove {
      position: absolute;
      top: 2px;
      right: 2px;
      background: rgb(0 0 0 / 0.55);
      --mat-icon-button-icon-color: #fff;
      --mat-icon-button-state-layer-size: 32px;
      width: 32px;
      height: 32px;
      padding: 4px;
    }
    .ph__add {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      width: 100%;
      height: 100%;
      border: 2px dashed var(--color-border-strong);
      border-radius: var(--radius-md);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      cursor: pointer;
    }
    .ph__add:hover,
    .ph__add:focus-within {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    .ph__add:focus-within {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
    .ph__add--busy {
      cursor: progress;
    }
    .ph__hint {
      margin: var(--spacing-2) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .ph__error {
      margin: var(--spacing-1) 0 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemPhotosComponent {
  readonly images = input<readonly InventoryItemImage[]>([]);
  readonly busy = input(false, { transform: booleanAttribute });
  /** Upload error from the API. */
  readonly error = input<string | null>(null);
  readonly upload = output<File>();
  readonly remove = output<string>();

  protected readonly maxCount = ITEM_PHOTO_MAX_COUNT;
  private readonly localError = signal<string | null>(null);
  protected readonly message = computed(() => this.localError() ?? this.error());
  protected readonly canAdd = computed(() => this.images().length < ITEM_PHOTO_MAX_COUNT);

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const problem = validateItemPhoto(file);
    this.localError.set(problem);
    if (!problem) {
      this.upload.emit(file);
    }
  }
}
