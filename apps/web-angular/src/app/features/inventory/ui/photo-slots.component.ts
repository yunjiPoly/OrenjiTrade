import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MediaUrlPipe } from '../../../shared/pipes/media-url.pipe';

export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const PHOTO_MAX_COUNT = 4;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Client-side check before uploading (the API re-checks, re-encodes and strips the metadata). */
export function validatePhoto(file: Pick<File, 'type' | 'size'>): string | null {
  if (!PHOTO_TYPES.includes(file.type)) {
    return 'Use a JPEG, PNG or WebP photo.';
  }
  if (file.size === 0) {
    return 'That file is empty.';
  }
  return file.size > PHOTO_MAX_BYTES ? 'Choose a photo smaller than 8 MB.' : null;
}

export interface PhotoSlot {
  id: string;
  url: string;
}

/**
 * Photos of a card or a deck core (spec 9.8 and 9.12): four 88×88 slots, "Photos 1 / 4"; images
 * are dropped on the slots or chosen with the first empty one; each photo has a remove button.
 * The first photo of a deck core is its cover.
 */
@Component({
  selector: 'app-photo-slots',
  imports: [MatIconModule, MediaUrlPipe],
  template: `
    <div class="ps__head">
      <span class="ps__title" [id]="labelId()">Photos</span>
      <span class="ps__count">{{ photos().length }} / {{ max }}</span>
    </div>
    <ul
      class="ps"
      [attr.aria-labelledby]="labelId()"
      [class.ps--over]="over()"
      (dragover)="onDragOver($event)"
      (dragleave)="over.set(false)"
      (drop)="onDrop($event)"
    >
      @for (photo of photos(); track photo.id; let i = $index) {
        <li class="ps__slot ps__slot--photo">
          <img [src]="photo.url | mediaUrl" [alt]="'Photo ' + (i + 1)" loading="lazy" />
          @if (i === 0 && coverLabel()) {
            <span class="ps__cover">Cover</span>
          }
          <button
            type="button"
            class="ps__remove"
            [disabled]="busy()"
            [attr.aria-label]="'Remove photo ' + (i + 1)"
            (click)="remove.emit(photo.id)"
          >
            <mat-icon aria-hidden="true">close</mat-icon>
          </button>
        </li>
      }
      @for (slot of empty(); track slot) {
        <li class="ps__slot">
          @if (slot === 0) {
            <label class="ps__add" [class.ps__add--busy]="busy()">
              <mat-icon aria-hidden="true">{{
                busy() ? 'hourglass_top' : 'add_photo_alternate'
              }}</mat-icon>
              <span>{{ busy() ? 'Uploading…' : 'Add photo' }}</span>
              <input
                class="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                [disabled]="busy()"
                (change)="onFile($event)"
              />
            </label>
          } @else {
            <span class="ps__empty" aria-hidden="true"><mat-icon>add</mat-icon></span>
          }
        </li>
      }
    </ul>
    <p class="ps__hint">{{ hint() }}</p>
    @if (message(); as text) {
      <p class="ps__error" role="alert">{{ text }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .ps__head {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .ps__count {
      color: var(--color-text-muted);
      font-weight: var(--font-weight-medium);
    }
    .ps {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 88px));
      gap: 8px;
      margin: 0;
      padding: 0;
      border-radius: 12px;
      list-style: none;
    }
    .ps--over {
      outline: 2px dashed var(--app-primary-text);
      outline-offset: 4px;
    }
    .ps__slot {
      position: relative;
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: 10px;
      background: var(--color-photo-backdrop);
    }
    .ps__slot img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .ps__cover {
      position: absolute;
      bottom: 4px;
      left: 4px;
      padding: 1px 6px;
      border-radius: 5px;
      background: rgb(0 0 0 / 0.65);
      color: #fff;
      font-size: var(--font-size-tag);
      font-weight: var(--font-weight-semibold);
    }
    .ps__remove {
      position: absolute;
      top: 4px;
      right: 4px;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border: 0;
      border-radius: 50%;
      background: rgb(0 0 0 / 0.65);
      color: #fff;
      cursor: pointer;
    }
    .ps__remove mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .ps__remove:focus-visible,
    .ps__add:focus-within {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .ps__add,
    .ps__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      width: 100%;
      height: 100%;
      border: 1px dashed var(--color-border-strong);
      border-radius: 10px;
      background: var(--color-surface);
      color: var(--color-text-muted);
      font-size: var(--font-size-tag);
      font-weight: var(--font-weight-semibold);
      box-sizing: border-box;
    }
    .ps__add {
      border-color: var(--app-primary-text);
      color: var(--app-primary-text);
      cursor: pointer;
    }
    .ps__add--busy {
      cursor: progress;
    }
    .ps__hint {
      margin: 8px 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
    }
    .ps__error {
      margin: 6px 0 0;
      color: var(--color-danger);
      font-size: var(--font-size-meta);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoSlotsComponent {
  readonly photos = input<readonly PhotoSlot[]>([]);
  readonly busy = input(false, { transform: booleanAttribute });
  readonly error = input<string | null>(null);
  readonly hint = input('Show the real card, front and back. Location data is removed.');
  /** A deck core: the first photo is labelled "Cover". */
  readonly coverLabel = input(false, { transform: booleanAttribute });
  readonly labelId = input('photos-label');
  readonly upload = output<File>();
  readonly remove = output<string>();

  protected readonly max = PHOTO_MAX_COUNT;
  protected readonly over = signal(false);
  private readonly localError = signal<string | null>(null);
  protected readonly message = computed(() => this.localError() ?? this.error());
  protected readonly empty = computed(() =>
    Array.from({ length: Math.max(0, PHOTO_MAX_COUNT - this.photos().length) }, (_, i) => i),
  );

  /** Images dropped on the drawer (spec 9.7) or on the slots. */
  addFiles(files: readonly File[]): void {
    const room = PHOTO_MAX_COUNT - this.photos().length;
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) {
      return;
    }
    if (room <= 0) {
      this.localError.set('At most 4 photos.');
      return;
    }
    for (const file of images.slice(0, room)) {
      const problem = validatePhoto(file);
      this.localError.set(problem);
      if (!problem) {
        this.upload.emit(file);
      }
    }
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    this.addFiles(files);
  }

  protected onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      event.stopPropagation();
      this.over.set(true);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.over.set(false);
    this.addFiles([...(event.dataTransfer?.files ?? [])]);
  }
}
