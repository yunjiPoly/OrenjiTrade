import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type {
  AdminPrintingRequest,
  GameSchema,
  PrintingDetail,
  SetSummary,
} from '@orenji/api-client';
import { editionLabel, finishLabel, languageLabel } from '../../../shared/catalog/catalog-labels';

export interface PrintingEditDialogData {
  detail: PrintingDetail;
  schema: GameSchema | null;
  sets: SetSummary[];
}

const CURRENCY = /^[A-Z]{3}$/;

/** Edits one printing; closes with the `AdminPrintingRequest` to send (metadata kept as is). */
@Component({
  selector: 'app-printing-edit-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Edit printing {{ data.detail.printing?.printingCode }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="printing-form">
        <mat-form-field appearance="outline" class="printing-form__wide">
          <mat-label>Set</mat-label>
          <mat-select formControlName="setId">
            @for (set of data.sets; track set.id) {
              <mat-option [value]="set.id">{{ set.name }} ({{ set.code }})</mat-option>
            }
          </mat-select>
          @if (form.controls.setId.hasError('required')) {
            <mat-error>Choose a set.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Collector number</mat-label>
          <input matInput formControlName="collectorNumber" maxlength="20" />
          @if (form.controls.collectorNumber.hasError('required')) {
            <mat-error>A collector number is required.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Printing code</mat-label>
          <input matInput formControlName="printingCode" maxlength="40" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Rarity</mat-label>
          <mat-select formControlName="rarity">
            <mat-option value="">None</mat-option>
            @for (rarity of data.schema?.rarities ?? []; track rarity) {
              <mat-option [value]="rarity">{{ rarity }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Edition</mat-label>
          <mat-select formControlName="edition">
            @for (edition of data.schema?.editions ?? []; track edition) {
              <mat-option [value]="edition">{{ editionName(edition) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Language</mat-label>
          <mat-select formControlName="language">
            @for (language of data.schema?.languages ?? []; track language) {
              <mat-option [value]="language">{{ languageName(language) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Finish</mat-label>
          <mat-select formControlName="finish">
            @for (finish of data.schema?.finishes ?? []; track finish) {
              <mat-option [value]="finish">{{ finishName(finish) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Market price</mat-label>
          <input matInput type="number" formControlName="marketPrice" min="0" step="0.01" />
          @if (form.controls.marketPrice.invalid) {
            <mat-error>Use an amount of 0 or more.</mat-error>
          }
          <mat-hint>Leave empty when unknown.</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Currency</mat-label>
          <input matInput formControlName="marketPriceCurrency" maxlength="3" />
          @if (form.controls.marketPriceCurrency.invalid) {
            <mat-error>Use a 3-letter code such as CAD.</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">Save printing</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .printing-form {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 var(--spacing-3);
    }
    .printing-form__wide {
      grid-column: 1 / -1;
    }
    @media (max-width: 599px) {
      .printing-form {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrintingEditDialogComponent {
  protected readonly data = inject<PrintingEditDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<PrintingEditDialogComponent, AdminPrintingRequest>);
  protected readonly editionName = editionLabel;
  protected readonly languageName = languageLabel;
  protected readonly finishName = finishLabel;

  private readonly printing = this.data.detail.printing ?? {};
  protected readonly form = inject(FormBuilder).nonNullable.group({
    setId: [this.printing.setId ?? '', Validators.required],
    collectorNumber: [
      this.printing.collectorNumber ?? '',
      [Validators.required, Validators.maxLength(20)],
    ],
    printingCode: [this.printing.printingCode ?? '', Validators.maxLength(40)],
    rarity: [this.printing.rarity ?? ''],
    edition: [this.printing.edition ?? '', Validators.required],
    language: [this.printing.language ?? '', Validators.required],
    finish: [this.printing.finish ?? '', Validators.required],
    marketPrice: [
      this.printing.marketPrice?.amount === undefined
        ? ''
        : String(this.printing.marketPrice.amount),
      Validators.min(0),
    ],
    marketPriceCurrency: [
      this.printing.marketPrice?.currency ?? 'CAD',
      Validators.pattern(CURRENCY),
    ],
  });

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    const price = String(value.marketPrice ?? '').trim();
    this.ref.close({
      setId: value.setId,
      collectorNumber: value.collectorNumber.trim(),
      printingCode: value.printingCode.trim() || undefined,
      rarity: value.rarity || undefined,
      edition: value.edition,
      language: value.language,
      finish: value.finish,
      marketPrice: price === '' ? undefined : Number(price),
      marketPriceCurrency: price === '' ? undefined : value.marketPriceCurrency.toUpperCase(),
      metadata: this.data.detail.metadata ?? {},
    });
  }
}
