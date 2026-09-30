import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ResolveFlagDialogData {
  /** "Community post by @handle", "Private message", ... */
  subject: string;
}

/** Closes an automatic moderation flag with an optional note (kept in the audit log). */
@Component({
  selector: 'app-resolve-flag-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Resolve this flag?</h2>
    <form (submit)="confirm($event)">
      <mat-dialog-content>
        <p class="resolve__lead">
          {{ data.subject }}. Resolving closes the flag; it does not remove the content or act on
          the member.
        </p>
        <mat-form-field appearance="outline" class="resolve__field">
          <mat-label>Note (optional)</mat-label>
          <textarea matInput [formControl]="note" rows="3" maxlength="500"></textarea>
          <mat-hint align="end">{{ note.value.length }} / 500</mat-hint>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">Resolve</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .resolve__lead {
      margin: 0 0 var(--spacing-3);
      color: var(--color-text-muted);
    }
    .resolve__field {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResolveFlagDialogComponent {
  protected readonly data = inject<ResolveFlagDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<ResolveFlagDialogComponent, { note: string }>>(MatDialogRef);
  protected readonly note = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });

  protected confirm(event: Event): void {
    event.preventDefault();
    if (this.note.invalid) {
      return;
    }
    this.ref.close({ note: this.note.value.trim() });
  }
}
