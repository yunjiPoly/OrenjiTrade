import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { AdCreativeRequest, AdminAdCreative } from '@orenji/api-client';
import {
  AD_PLACEMENTS,
  CREATIVE_STATUSES,
  LIMITS,
  placementLabel,
  statusText,
} from './admin-billing-labels';

/** Landing and image URLs: https or a site path (the API refuses anything else). */
export function adUrlError(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  if (!text) {
    return null;
  }
  if (text.length > LIMITS.url) {
    return `Keep it under ${LIMITS.url} characters.`;
  }
  return /^https:\/\/[^\s/]+(\/\S*)?$/.test(text) || /^\/(?!\/)\S*$/.test(text)
    ? null
    : 'Use an https:// address or a site path like /premium.';
}

function urlValidator(control: AbstractControl<string>): ValidationErrors | null {
  return adUrlError(control.value) ? { url: true } : null;
}

/** Creates or edits a creative: placement, headline, body, image, call to action and landing. */
@Component({
  selector: 'app-creative-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ creative ? 'Edit creative' : 'New creative' }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="dialog-form">
        <div class="dialog-form__row">
          <mat-form-field appearance="outline">
            <mat-label>Placement</mat-label>
            <mat-select formControlName="placement">
              @for (placement of placements; track placement) {
                <mat-option [value]="placement">{{ placementName(placement) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Status</mat-label>
            <mat-select formControlName="status">
              @for (status of statuses; track status) {
                <mat-option [value]="status">{{ text(status) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline">
          <mat-label>Headline</mat-label>
          <input matInput formControlName="headline" [attr.maxlength]="limits.headline" />
          @if (form.controls.headline.hasError('required')) {
            <mat-error>Enter a headline.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Body (optional)</mat-label>
          <textarea
            matInput
            formControlName="body"
            rows="2"
            [attr.maxlength]="limits.body"
          ></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Call to action</mat-label>
          <input matInput formControlName="ctaLabel" [attr.maxlength]="limits.ctaLabel" />
          @if (form.controls.ctaLabel.hasError('required')) {
            <mat-error>Enter a short call to action.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Landing page</mat-label>
          <input matInput formControlName="landingUrl" [attr.maxlength]="limits.url" />
          <mat-hint>https:// address or a site path like /premium.</mat-hint>
          @if (form.controls.landingUrl.hasError('required')) {
            <mat-error>Enter where the ad leads.</mat-error>
          } @else if (form.controls.landingUrl.hasError('url')) {
            <mat-error>{{ urlError(form.controls.landingUrl.value) }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Image (optional)</mat-label>
          <input matInput formControlName="imageUrl" [attr.maxlength]="limits.url" />
          @if (form.controls.imageUrl.hasError('url')) {
            <mat-error>{{ urlError(form.controls.imageUrl.value) }}</mat-error>
          }
        </mat-form-field>
        <p class="dialog-form__note">Ads are always shown with a “Sponsored” label.</p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">
          {{ creative ? 'Save creative' : 'Add creative' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
    }
    .dialog-form__row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-3);
    }
    .dialog-form__row mat-form-field {
      flex: 1 1 180px;
    }
    .dialog-form__note {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreativeDialogComponent {
  protected readonly creative = inject<AdminAdCreative | null>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<CreativeDialogComponent, AdCreativeRequest>>(MatDialogRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly limits = LIMITS;
  protected readonly placements = AD_PLACEMENTS;
  protected readonly statuses = CREATIVE_STATUSES;
  protected readonly text = statusText;
  protected readonly placementName = placementLabel;
  protected readonly urlError = adUrlError;
  protected readonly form = this.fb.group({
    placement: this.fb.control<string>(this.creative?.placement ?? 'SEARCH_SPONSORED'),
    status: this.fb.control<string>(this.creative?.status ?? 'ACTIVE'),
    headline: this.fb.control(this.creative?.headline ?? '', [
      Validators.required,
      Validators.maxLength(LIMITS.headline),
    ]),
    body: this.fb.control(this.creative?.body ?? '', [Validators.maxLength(LIMITS.body)]),
    ctaLabel: this.fb.control(this.creative?.ctaLabel ?? '', [
      Validators.required,
      Validators.maxLength(LIMITS.ctaLabel),
    ]),
    landingUrl: this.fb.control(this.creative?.landingUrl ?? '', [
      Validators.required,
      urlValidator,
    ]),
    imageUrl: this.fb.control(this.creative?.imageUrl ?? '', [urlValidator]),
  });

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    this.ref.close({
      placement: value.placement as AdCreativeRequest['placement'],
      status: value.status as AdCreativeRequest['status'],
      headline: value.headline.trim(),
      body: value.body.trim() || undefined,
      ctaLabel: value.ctaLabel.trim(),
      landingUrl: value.landingUrl.trim(),
      imageUrl: value.imageUrl.trim() || undefined,
    });
  }
}
