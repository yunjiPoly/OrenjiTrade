import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';

/** Accepted by `POST /me/profile/avatar` (the server re-encodes to 512×512, strips metadata). */
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Client-side check before uploading; returns a user-facing message or null when valid. */
export function validateAvatarFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) {
    return 'Use a JPEG, PNG or WebP image.';
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return 'Choose an image smaller than 5 MB.';
  }
  if (file.size === 0) {
    return 'That file is empty.';
  }
  return null;
}

/**
 * Avatar editor: shows the current picture, previews a chosen file (validated locally for type
 * and size) and emits it for upload; also offers removal. The parent performs the API calls.
 */
@Component({
  selector: 'app-avatar-uploader',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, AvatarComponent],
  template: `
    <div class="uploader">
      <div class="uploader__preview">
        <app-avatar size="xl" [src]="preview() ?? currentUrl()" [name]="name()" />
        @if (busy()) {
          <span class="uploader__busy"><mat-spinner diameter="32" aria-label="Uploading" /></span>
        }
      </div>
      <div class="uploader__body">
        <p class="uploader__hint">JPEG, PNG or WebP, up to 5 MB. We crop it to a square.</p>
        <input
          #fileInput
          class="visually-hidden"
          type="file"
          [accept]="accept"
          (change)="onFile($event)"
          aria-label="Choose a profile picture"
          tabindex="-1"
        />
        <div class="uploader__actions">
          @if (pendingFile()) {
            <button matButton="filled" type="button" [disabled]="busy()" (click)="confirm()">
              <mat-icon aria-hidden="true">cloud_upload</mat-icon>
              Save picture
            </button>
            <button matButton type="button" [disabled]="busy()" (click)="clear()">Cancel</button>
          } @else {
            <button matButton="tonal" type="button" [disabled]="busy()" (click)="pick()">
              <mat-icon aria-hidden="true">add_a_photo</mat-icon>
              {{ currentUrl() ? 'Change picture' : 'Upload picture' }}
            </button>
            @if (currentUrl()) {
              <button matButton type="button" [disabled]="busy()" (click)="remove.emit()">
                <mat-icon aria-hidden="true">delete</mat-icon>
                Remove
              </button>
            }
          }
        </div>
        @if (error(); as message) {
          <p class="uploader__error" role="alert">{{ message }}</p>
        }
      </div>
    </div>
  `,
  styles: `
    .uploader {
      display: flex;
      align-items: center;
      gap: var(--spacing-5);
      flex-wrap: wrap;
    }
    .uploader__preview {
      position: relative;
    }
    .uploader__busy {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: rgb(0 0 0 / 0.35);
    }
    .uploader__body {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
    }
    .uploader__hint {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .uploader__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
    }
    .uploader__error {
      margin: 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarUploaderComponent {
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  readonly currentUrl = input<string | null | undefined>(null);
  readonly name = input<string | null | undefined>('');
  readonly busy = input(false, { transform: booleanAttribute });
  /** Error from the server (shown under the buttons). */
  readonly serverError = input<string | null>(null);
  readonly upload = output<File>();
  readonly remove = output<void>();

  protected readonly accept = AVATAR_TYPES.join(',');
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly preview = signal<string | null>(null);
  protected readonly localError = signal<string | null>(null);
  protected readonly error = computed(() => this.localError() ?? this.serverError());

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revokePreview());
  }

  /** Resets the pending selection (called by the parent after a successful upload). */
  clear(): void {
    this.pendingFile.set(null);
    this.revokePreview();
    this.localError.set(null);
    this.fileInput().nativeElement.value = '';
  }

  protected pick(): void {
    this.fileInput().nativeElement.click();
  }

  protected onFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    const problem = validateAvatarFile(file);
    if (problem) {
      this.clear();
      this.localError.set(problem);
      return;
    }
    this.localError.set(null);
    this.revokePreview();
    this.pendingFile.set(file);
    this.preview.set(URL.createObjectURL(file));
  }

  protected confirm(): void {
    const file = this.pendingFile();
    if (file) {
      this.upload.emit(file);
    }
  }

  private revokePreview(): void {
    const url = this.preview();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.preview.set(null);
  }
}
