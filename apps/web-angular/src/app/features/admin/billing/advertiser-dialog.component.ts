import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  AdminAdvertiser,
  AdvertiserRequest,
  AdvertiserRequestStatusEnum,
} from '@orenji/api-client';
import { ADVERTISER_STATUSES, LIMITS, statusText } from './admin-billing-labels';

/** Creates or edits an advertiser (business contact visible to admins only). */
@Component({
  selector: 'app-advertiser-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ advertiser ? 'Edit advertiser' : 'New advertiser' }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="dialog-form">
        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" [attr.maxlength]="limits.advertiserName" />
          @if (form.controls.name.hasError('required')) {
            <mat-error>Enter the advertiser's name.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Business contact email (optional)</mat-label>
          <input matInput type="email" formControlName="contactEmail" maxlength="254" />
          <mat-hint>Visible to admins only; never shown in ads.</mat-hint>
          @if (form.controls.contactEmail.hasError('email')) {
            <mat-error>Enter a valid email address.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Status</mat-label>
          <mat-select formControlName="status">
            @for (status of statuses; track status) {
              <mat-option [value]="status">{{ text(status) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">
          {{ advertiser ? 'Save advertiser' : 'Create advertiser' }}
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdvertiserDialogComponent {
  protected readonly advertiser = inject<AdminAdvertiser | null>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<AdvertiserDialogComponent, AdvertiserRequest>>(MatDialogRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly limits = LIMITS;
  protected readonly statuses = ADVERTISER_STATUSES;
  protected readonly text = statusText;
  protected readonly form = this.fb.group({
    name: this.fb.control(this.advertiser?.name ?? '', [
      Validators.required,
      Validators.maxLength(LIMITS.advertiserName),
    ]),
    contactEmail: this.fb.control(this.advertiser?.contactEmail ?? '', [
      Validators.email,
      Validators.maxLength(254),
    ]),
    status: this.fb.control<string>(this.advertiser?.status ?? 'ACTIVE'),
  });

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    this.ref.close({
      name: value.name.trim(),
      contactEmail: value.contactEmail.trim() || undefined,
      status: value.status as AdvertiserRequestStatusEnum,
    });
  }
}
