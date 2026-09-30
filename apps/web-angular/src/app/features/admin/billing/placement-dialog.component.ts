import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { AdPlacementRequest, AdminAdPlacement } from '@orenji/api-client';
import { placementLabel } from './admin-billing-labels';

/** Edits an ad placement: name, whether it serves ads, and how many ads per request (1-5). */
@Component({
  selector: 'app-placement-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>Edit placement “{{ label(placement.key) }}”</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="dialog-form">
        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" maxlength="80" />
          @if (form.controls.name.hasError('required')) {
            <mat-error>Enter a name.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Ads per request</mat-label>
          <input matInput type="number" formControlName="maxAds" min="1" max="5" />
          @if (form.controls.maxAds.invalid) {
            <mat-error>1 to 5.</mat-error>
          }
        </mat-form-field>
        <mat-slide-toggle formControlName="active">Serve ads in this placement</mat-slide-toggle>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">Save placement</button>
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
export class PlacementDialogComponent {
  protected readonly placement = inject<AdminAdPlacement>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<PlacementDialogComponent, AdPlacementRequest>>(MatDialogRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly label = placementLabel;
  protected readonly form = this.fb.group({
    name: this.fb.control(this.placement.name ?? '', [
      Validators.required,
      Validators.maxLength(80),
    ]),
    maxAds: this.fb.control(this.placement.maxAds ?? 1, [
      Validators.required,
      Validators.min(1),
      Validators.max(5),
    ]),
    active: this.fb.control(this.placement.active !== false),
  });

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    this.ref.close({ name: value.name.trim(), maxAds: Number(value.maxAds), active: value.active });
  }
}
