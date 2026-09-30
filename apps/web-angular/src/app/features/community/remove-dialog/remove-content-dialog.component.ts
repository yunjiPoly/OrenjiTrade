import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface RemoveContentDialogData {
  /** "post" or "reply". */
  subject: string;
  authorName: string;
}

/** Moderator removal of a post or reply: the reason is required and audited, never shown. */
@Component({
  selector: 'app-remove-content-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Remove this {{ data.subject }}?</h2>
    <form (submit)="confirm($event)">
      <mat-dialog-content>
        <p class="remove__lead">
          The {{ data.subject }} by {{ data.authorName }} disappears for everyone. The reason is
          kept in the audit log and is never shown to members.
        </p>
        <mat-form-field appearance="outline" class="remove__field">
          <mat-label>Reason</mat-label>
          <textarea matInput [formControl]="reason" rows="3" maxlength="500" required></textarea>
          @if (reason.hasError('required') && reason.touched) {
            <mat-error>Give a short reason for the audit log.</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" class="remove__confirm">Remove</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .remove__lead {
      margin: 0 0 var(--spacing-3);
      color: var(--color-text-muted);
    }
    .remove__field {
      width: 100%;
    }
    .remove__confirm {
      --mat-button-filled-container-color: var(--color-danger);
      --mat-button-filled-label-text-color: #fff;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoveContentDialogComponent {
  protected readonly data = inject<RemoveContentDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<RemoveContentDialogComponent, string>>(MatDialogRef);
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(500)],
  });

  protected confirm(event: Event): void {
    event.preventDefault();
    const reason = this.reason.value.trim();
    if (!reason) {
      this.reason.setValue('');
      this.reason.markAsTouched();
      return;
    }
    this.ref.close(reason);
  }
}
