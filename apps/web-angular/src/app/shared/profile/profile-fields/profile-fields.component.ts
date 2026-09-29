import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { BIO_MAX, DISPLAY_NAME_MAX, HANDLE_MAX, HANDLE_MIN, ProfileForm } from '../profile-form';

/** Handle, display name and bio fields with inline validation (parent owns the form). */
@Component({
  selector: 'app-profile-fields',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="fields" [formGroup]="form()">
      <mat-form-field appearance="outline" class="fields__handle">
        <mat-label>Handle</mat-label>
        <span matTextPrefix>&#64;</span>
        <input
          matInput
          formControlName="handle"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          [maxlength]="handleMax"
          (input)="lowercase($event)"
          required
        />
        <mat-hint>Lowercase letters, digits and _. It is your profile address.</mat-hint>
        @let handle = form().controls.handle;
        @if (handle.hasError('required')) {
          <mat-error>Choose a handle.</mat-error>
        } @else if (handle.hasError('taken')) {
          <mat-error>That handle is already taken. Try another one.</mat-error>
        } @else if (handle.hasError('minlength')) {
          <mat-error>Use at least {{ handleMin }} characters.</mat-error>
        } @else if (handle.hasError('pattern')) {
          <mat-error>Only lowercase letters, digits and underscores.</mat-error>
        } @else if (handle.hasError('server')) {
          <mat-error>{{ handle.getError('server') }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Display name</mat-label>
        <input
          matInput
          formControlName="displayName"
          autocomplete="nickname"
          [maxlength]="nameMax"
          required
        />
        <mat-hint>How other collectors see you.</mat-hint>
        @let name = form().controls.displayName;
        @if (name.hasError('required')) {
          <mat-error>Enter a display name.</mat-error>
        } @else if (name.hasError('server')) {
          <mat-error>{{ name.getError('server') }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" class="fields__bio">
        <mat-label>Bio</mat-label>
        <textarea
          matInput
          formControlName="bio"
          rows="3"
          [maxlength]="bioMax"
          placeholder="What do you collect? Where do you like to meet?"
        ></textarea>
        <mat-hint align="end">{{ form().controls.bio.value.length }} / {{ bioMax }}</mat-hint>
        @if (form().controls.bio.hasError('server')) {
          <mat-error>{{ form().controls.bio.getError('server') }}</mat-error>
        }
      </mat-form-field>
    </div>
  `,
  styles: `
    .fields {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--spacing-2) var(--spacing-4);
    }
    .fields__bio {
      grid-column: 1 / -1;
    }
    mat-form-field {
      width: 100%;
    }
    @media (max-width: 599px) {
      .fields {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileFieldsComponent {
  readonly form = input.required<ProfileForm>();
  protected readonly handleMin = HANDLE_MIN;
  protected readonly handleMax = HANDLE_MAX;
  protected readonly nameMax = DISPLAY_NAME_MAX;
  protected readonly bioMax = BIO_MAX;

  protected lowercase(event: Event): void {
    const target = event.target as HTMLInputElement;
    const lower = target.value.toLowerCase();
    if (lower !== target.value) {
      this.form().controls.handle.setValue(lower);
    }
  }
}
