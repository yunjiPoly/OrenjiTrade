import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RatingsService, ReferenceResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/http/api-error';
import { silentErrors } from '../../core/http/http-context';
import type { RatedCollector } from './rate-collector-dialog.component';
import { REFERENCE_MAX, ratingProblem } from './rating-labels';

export interface ReferenceDialogData {
  collector: RatedCollector;
}

/**
 * "Write a reference": one short public recommendation (≤ 400 characters) per author and
 * collector, allowed after an interaction (`POST /references`; 403 without one, 409 for a second
 * reference, banned terms refused). Closes with the saved reference.
 */
@Component({
  selector: 'app-write-reference-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Write a reference for {{ data.collector.displayName }}</h2>
    <form (submit)="submit($event)" novalidate>
      <mat-dialog-content>
        <p class="lead">
          A reference is a short public recommendation shown on
          {{ data.collector.displayName }}'s profile. You can write one per collector.
        </p>
        <mat-form-field appearance="outline" class="body">
          <mat-label>Reference</mat-label>
          <textarea
            matInput
            [formControl]="body"
            rows="4"
            [attr.maxlength]="max"
            required
            placeholder="What makes them a great collector to trade with?"
          ></textarea>
          <mat-hint align="end">{{ length() }} / {{ max }}</mat-hint>
          @if (body.hasError('required')) {
            <mat-error>Write a few words first.</mat-error>
          } @else if (body.hasError('maxlength')) {
            <mat-error>Keep it under {{ max }} characters.</mat-error>
          }
        </mat-form-field>
        @if (problem(); as problem) {
          <p class="problem" role="alert" data-testid="reference-error">
            <mat-icon aria-hidden="true">error</mat-icon>
            <span>{{ problem }}</span>
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">
          {{ saving() ? 'Publishing…' : 'Publish reference' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .lead {
      margin: 0 0 var(--spacing-3);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .body {
      display: block;
      width: 100%;
    }
    .problem {
      display: flex;
      gap: var(--spacing-2);
      margin: var(--spacing-2) 0 0;
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface));
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WriteReferenceDialogComponent {
  private readonly api = inject(RatingsService);
  private readonly ref =
    inject<MatDialogRef<WriteReferenceDialogComponent, ReferenceResponse>>(MatDialogRef);
  protected readonly data = inject<ReferenceDialogData>(MAT_DIALOG_DATA);
  protected readonly max = REFERENCE_MAX;
  protected readonly body = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(REFERENCE_MAX)],
  });
  private readonly value = toSignal(this.body.valueChanges, { initialValue: '' });
  protected readonly length = computed(() => this.value().length);
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const text = this.body.value.trim();
    if (!text) {
      this.body.setValue('');
    }
    if (this.body.invalid || !text) {
      this.body.markAsTouched();
      return;
    }
    this.saving.set(true);
    this.problem.set(null);
    try {
      const reference = await firstValueFrom(
        this.api.createReference(
          { createReferenceRequest: { subjectId: this.data.collector.id, body: text } },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.ref.close(reference);
    } catch (error) {
      this.problem.set(
        ratingProblem(toApiError(error), this.data.collector.displayName, 'reference'),
      );
    } finally {
      this.saving.set(false);
    }
  }
}
