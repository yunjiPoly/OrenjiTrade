import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { BinderResponse, CreateBinderRequest, UpdateBinderRequest } from '@orenji/api-client';
import { ApiError } from '../../../core/http/api-error';
import { friendlyError } from '../../../core/http/api-error-messages';
import { isLimitReached } from '../../../core/limits/limit-reached';
import {
  BINDER_KINDS,
  BINDER_KIND_INFO,
  BinderKind,
} from '../../../shared/inventory/inventory-labels';
import { InventoryStore } from '../data/inventory.store';

export interface BinderFormDialogData {
  /** Edits this binder; creates a new one when absent. */
  binder?: BinderResponse;
}

export const BINDER_NAME_MAX = 80;
export const BINDER_DESCRIPTION_MAX = 1000;

/**
 * Creates or edits a binder (name, kind, description). Saves through the page's
 * {@link InventoryStore} and stays open on errors; a reached `binders.max` opens the global
 * limit-reached dialog. Closes with the saved binder.
 */
@Component({
  selector: 'app-binder-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ editing ? 'Edit binder' : 'New binder' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="bf">
        @if (!editing) {
          <p class="bf__lead">
            New binders are private. Fill them first, then publish when you are ready.
          </p>
        }
        <mat-form-field appearance="outline">
          <mat-label>Binder name</mat-label>
          <input matInput formControlName="name" [maxlength]="nameMax" cdkFocusInitial />
          <mat-hint align="end">{{ form.controls.name.value.length }} / {{ nameMax }}</mat-hint>
          @if (form.controls.name.hasError('required')) {
            <mat-error>Give your binder a name.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Kind</mat-label>
          <mat-select formControlName="kind">
            @for (kind of kinds; track kind) {
              <mat-option [value]="kind">{{ kindInfo[kind].label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Description (optional)</mat-label>
          <textarea
            matInput
            formControlName="description"
            rows="3"
            [maxlength]="descriptionMax"
          ></textarea>
          <mat-hint>Shown on the public binder page.</mat-hint>
        </mat-form-field>
        @if (error(); as error) {
          <p class="bf__error" role="alert">{{ error }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">
          {{ saving() ? 'Saving…' : editing ? 'Save binder' : 'Create binder' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .bf {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
    }
    .bf__lead {
      margin: 0 0 var(--spacing-2);
      color: var(--color-text-muted);
    }
    .bf__error {
      margin: 0;
      color: var(--color-danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BinderFormDialogComponent {
  private readonly data = inject<BinderFormDialogData | null>(MAT_DIALOG_DATA, { optional: true });
  private readonly dialogRef =
    inject<MatDialogRef<BinderFormDialogComponent, BinderResponse>>(MatDialogRef);
  private readonly store = inject(InventoryStore);

  protected readonly editing = !!this.data?.binder;
  protected readonly kinds = BINDER_KINDS;
  protected readonly kindInfo = BINDER_KIND_INFO;
  protected readonly nameMax = BINDER_NAME_MAX;
  protected readonly descriptionMax = BINDER_DESCRIPTION_MAX;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = new FormGroup({
    name: new FormControl(this.data?.binder?.name ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(BINDER_NAME_MAX)],
    }),
    kind: new FormControl<BinderKind>((this.data?.binder?.kind as BinderKind) ?? 'TRADE', {
      nonNullable: true,
    }),
    description: new FormControl(this.data?.binder?.description ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(BINDER_DESCRIPTION_MAX)],
    }),
  });

  protected async save(): Promise<void> {
    this.form.controls.name.setValue(this.form.controls.name.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, kind, description } = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    try {
      const binder = this.data?.binder
        ? await this.store.updateBinder(this.data.binder.id, {
            name,
            kind: kind as UpdateBinderRequest['kind'],
            description: description.trim(),
          })
        : await this.store.createBinder({
            name,
            kind: kind as CreateBinderRequest['kind'],
            description: description.trim() || undefined,
          });
      this.dialogRef.close(binder);
    } catch (error) {
      const apiError = error as ApiError;
      this.error.set(
        isLimitReached(apiError)
          ? 'You reached the number of binders your plan allows.'
          : friendlyError(apiError).message,
      );
    } finally {
      this.saving.set(false);
    }
  }
}
