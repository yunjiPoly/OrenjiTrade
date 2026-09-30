import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { BroadcastRequest, BroadcastRequestAudienceEnum } from '@orenji/api-client';

export const BROADCAST_TITLE_MAX = 200;
export const BROADCAST_BODY_MAX = 1000;
/** Same rule as the API (`NotificationAdminService.DEEP_LINK`). */
export const DEEP_LINK_PATTERN = /^\/[A-Za-z0-9/_?=&.%-]{0,199}$/;

function deepLinkValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value.trim();
  return !value || DEEP_LINK_PATTERN.test(value) ? null : { deepLink: true };
}

/**
 * Broadcast composer (SUPER_ADMIN): title, body, audience (every reachable account or staff
 * only) and an optional in-app link. Emits the request; the page confirms and sends it.
 */
@Component({
  selector: 'app-broadcast-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="broadcast">
      <mat-form-field appearance="outline">
        <mat-label>Title</mat-label>
        <input matInput formControlName="title" [attr.maxlength]="titleMax" required />
        @if (form.controls.title.hasError('required')) {
          <mat-error>A title is required.</mat-error>
        }
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Message</mat-label>
        <textarea
          matInput
          formControlName="body"
          rows="4"
          [attr.maxlength]="bodyMax"
          required
        ></textarea>
        <mat-hint align="end">{{ form.controls.body.value.length }} / {{ bodyMax }}</mat-hint>
        @if (form.controls.body.hasError('required')) {
          <mat-error>A message is required.</mat-error>
        }
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Link in the app (optional)</mat-label>
        <input matInput formControlName="deepLink" placeholder="/community" />
        <mat-hint>A path such as /premium or /community/montreal-pokemon.</mat-hint>
        @if (form.controls.deepLink.hasError('deepLink')) {
          <mat-error>Use an app path starting with /.</mat-error>
        }
      </mat-form-field>
      <div class="broadcast__audience">
        <span id="broadcast-audience" class="broadcast__label">Audience</span>
        <mat-radio-group formControlName="audience" aria-labelledby="broadcast-audience">
          <mat-radio-button value="STAFF">Staff only (test first)</mat-radio-button>
          <mat-radio-button value="ALL">Every collector</mat-radio-button>
        </mat-radio-group>
      </div>
      <div class="broadcast__actions">
        <button matButton="filled" type="submit" [disabled]="busy()">
          <mat-icon aria-hidden="true">campaign</mat-icon>
          {{ busy() ? 'Sending…' : 'Send broadcast' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .broadcast {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
    }
    .broadcast__audience {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
    }
    .broadcast__label {
      font-weight: var(--font-weight-semibold);
    }
    .broadcast__actions {
      display: flex;
      justify-content: flex-end;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BroadcastFormComponent {
  readonly busy = input(false);
  readonly send = output<BroadcastRequest>();

  protected readonly titleMax = BROADCAST_TITLE_MAX;
  protected readonly bodyMax = BROADCAST_BODY_MAX;
  protected readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(BROADCAST_TITLE_MAX)],
    }),
    body: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(BROADCAST_BODY_MAX)],
    }),
    deepLink: new FormControl('', { nonNullable: true, validators: [deepLinkValidator] }),
    audience: new FormControl<'ALL' | 'STAFF'>('STAFF', { nonNullable: true }),
  });

  /** Clears the composer after a successful send. */
  reset(): void {
    this.form.reset();
  }

  protected submit(): void {
    const value = this.form.getRawValue();
    if (!value.title.trim()) {
      this.form.controls.title.setValue('');
    }
    if (!value.body.trim()) {
      this.form.controls.body.setValue('');
    }
    if (this.form.invalid || !value.title.trim() || !value.body.trim()) {
      this.form.markAllAsTouched();
      return;
    }
    const deepLink = value.deepLink.trim();
    this.send.emit({
      title: value.title.trim(),
      body: value.body.trim(),
      audience: value.audience as BroadcastRequestAudienceEnum,
      ...(deepLink ? { deepLink } : {}),
    });
  }
}
