import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  booleanAttribute,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  DISPUTE_TEXT_MAX,
  EVIDENCE_DOCUMENT_TYPES,
  EVIDENCE_IMAGE_TYPES,
  evidenceFileKind,
  fileSize,
} from '../../shared/payments/payment-labels';

export interface EvidenceUpload {
  file: File;
  kind: 'IMAGE' | 'DOCUMENT';
  caption: string;
}

interface Pending {
  file: File;
  kind: 'IMAGE' | 'DOCUMENT';
  preview: string | null;
}

/**
 * Adds a photo (JPEG, PNG or WebP ≤ 8 MB; the server re-encodes it without metadata) or a PDF
 * (≤ 10 MB) to a dispute, with an optional caption: the file is checked locally and previewed
 * before it is sent. `evidenceLeft` counts down from 10 per collector. The parent uploads and
 * calls {@link reset} once it was added.
 */
@Component({
  selector: 'app-evidence-uploader',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <div class="up" data-testid="evidence-uploader">
      <input
        #fileInput
        type="file"
        class="visually-hidden"
        tabindex="-1"
        aria-hidden="true"
        data-testid="evidence-file-input"
        [accept]="accept"
        (change)="onFile($event)"
      />
      @if (pending(); as p) {
        <div class="up__preview" data-testid="evidence-preview">
          @if (p.preview) {
            <img [src]="p.preview" alt="Preview of the photo to add" class="up__thumb" />
          } @else {
            <span class="up__pdf" aria-hidden="true"><mat-icon>picture_as_pdf</mat-icon></span>
          }
          <div class="up__file">
            <p class="up__name">{{ p.file.name }}</p>
            <p class="up__meta">
              {{ p.kind === 'IMAGE' ? 'Photo' : 'PDF document' }} · {{ size(p.file.size) }}
            </p>
            <button matButton type="button" (click)="reset()" [disabled]="busy()">
              <mat-icon aria-hidden="true">close</mat-icon>
              Remove
            </button>
          </div>
        </div>
        <mat-form-field appearance="outline" class="up__caption" subscriptSizing="dynamic">
          <mat-label>Caption (optional)</mat-label>
          <input matInput [formControl]="caption" [attr.maxlength]="max" />
          @if (caption.invalid) {
            <mat-error>Keep the caption under {{ max }} characters.</mat-error>
          }
        </mat-form-field>
        <div class="up__actions">
          <button matButton="filled" type="button" [disabled]="busy()" (click)="confirm()">
            <mat-icon aria-hidden="true">upload</mat-icon>
            {{ busy() ? 'Adding…' : 'Add evidence' }}
          </button>
        </div>
      } @else {
        <div class="up__empty">
          <button
            matButton="outlined"
            type="button"
            [disabled]="busy() || evidenceLeft() <= 0"
            (click)="pick()"
          >
            <mat-icon aria-hidden="true">add_photo_alternate</mat-icon>
            Add a photo or PDF
          </button>
          <p class="up__hint">
            Photos (JPEG, PNG, WebP) up to 8 MB, PDF documents up to 10 MB. You can add
            {{ evidenceLeft() }} more.
          </p>
        </div>
      }
      @if (error(); as message) {
        <p class="up__error" role="alert">{{ message }}</p>
      }
    </div>
  `,
  styles: `
    .up {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      padding: var(--spacing-4);
      border: 1px dashed var(--color-border-strong);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .up__empty {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-3);
    }
    .up__hint {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .up__preview {
      display: flex;
      gap: var(--spacing-3);
      align-items: center;
    }
    .up__thumb,
    .up__pdf {
      flex: 0 0 auto;
      width: 96px;
      height: 96px;
      border-radius: var(--radius-sm);
      object-fit: cover;
    }
    .up__pdf {
      display: grid;
      place-items: center;
      background: var(--color-surface-variant);
      color: var(--color-danger);
    }
    .up__file {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      min-width: 0;
    }
    .up__name {
      margin: 0;
      font-weight: var(--font-weight-semibold);
      overflow-wrap: anywhere;
    }
    .up__meta {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .up__caption {
      width: 100%;
    }
    .up__actions {
      display: flex;
      justify-content: flex-end;
    }
    .up__error {
      margin: 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvidenceUploaderComponent {
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  readonly evidenceLeft = input(10);
  readonly busy = input(false, { transform: booleanAttribute });
  readonly add = output<EvidenceUpload>();

  protected readonly accept = [...EVIDENCE_IMAGE_TYPES, ...EVIDENCE_DOCUMENT_TYPES].join(',');
  protected readonly max = DISPUTE_TEXT_MAX;
  protected readonly size = fileSize;
  protected readonly pending = signal<Pending | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly caption = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(DISPUTE_TEXT_MAX)],
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revoke());
  }

  /** Clears the selection (after an upload, or "Remove"). */
  reset(): void {
    this.revoke();
    this.pending.set(null);
    this.error.set(null);
    this.caption.reset('');
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
    const checked = evidenceFileKind(file);
    if ('error' in checked) {
      this.reset();
      this.error.set(checked.error);
      return;
    }
    this.revoke();
    this.error.set(null);
    this.pending.set({
      file,
      kind: checked.kind,
      preview: checked.kind === 'IMAGE' ? URL.createObjectURL(file) : null,
    });
  }

  protected confirm(): void {
    const pending = this.pending();
    if (!pending || this.caption.invalid) {
      this.caption.markAsTouched();
      return;
    }
    this.add.emit({ file: pending.file, kind: pending.kind, caption: this.caption.value });
  }

  private revoke(): void {
    const preview = this.pending()?.preview;
    if (preview) {
      URL.revokeObjectURL(preview);
    }
  }
}
