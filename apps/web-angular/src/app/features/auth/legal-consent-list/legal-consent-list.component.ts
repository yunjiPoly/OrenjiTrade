import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { RouterLink } from '@angular/router';
import { of, startWith, switchMap } from 'rxjs';

export interface ConsentItem {
  documentType: string;
  title: string;
  url: string;
}

/**
 * Checkbox per legal document (each links to its page in a new tab) plus "accept all".
 * The parent owns the `FormArray` (one `requiredTrue` control per item) and its validation.
 */
@Component({
  selector: 'app-legal-consent-list',
  imports: [ReactiveFormsModule, MatCheckboxModule, RouterLink],
  template: `
    <fieldset class="consents" [attr.aria-describedby]="showError() ? 'consents-error' : null">
      <legend class="consents__legend">Before you continue</legend>
      @if (items().length > 1) {
        <mat-checkbox
          class="consents__all"
          [checked]="allChecked()"
          [indeterminate]="someChecked() && !allChecked()"
          (change)="toggleAll($event.checked)"
        >
          Accept all
        </mat-checkbox>
      }
      <ul class="consents__list">
        @for (item of items(); track item.documentType; let i = $index) {
          <li>
            <mat-checkbox [formControl]="controls()[i]">
              I have read and accept the
              <a [routerLink]="item.url" target="_blank" rel="noopener">{{ item.title }}</a>
            </mat-checkbox>
          </li>
        }
      </ul>
      @if (showError()) {
        <p class="consents__error" id="consents-error" role="alert">
          Please accept every document to continue.
        </p>
      }
    </fieldset>
  `,
  styles: `
    .consents {
      margin: 0;
      padding: var(--spacing-3) var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .consents__legend {
      padding: 0 var(--spacing-1);
      font-weight: var(--font-weight-semibold);
      font-size: var(--font-size-sm);
    }
    .consents__all {
      display: block;
      padding-bottom: var(--spacing-1);
      border-bottom: 1px solid var(--color-border);
      font-weight: var(--font-weight-medium);
    }
    .consents__list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .consents__error {
      margin: var(--spacing-1) 0 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalConsentListComponent {
  readonly items = input.required<readonly ConsentItem[]>();
  readonly formArray = input.required<FormArray<FormControl<boolean>>>();
  /** Show the validation message (parent sets it after a submit attempt). */
  readonly showError = input(false);

  protected readonly controls = computed(() => this.formArray().controls);
  private readonly values = toSignal(
    toObservable(this.formArray).pipe(
      switchMap((array) => (array ? array.valueChanges.pipe(startWith(array.value)) : of([]))),
    ),
    { initialValue: [] as boolean[] },
  );
  protected readonly allChecked = computed(
    () => this.values().length > 0 && this.values().every(Boolean),
  );
  protected readonly someChecked = computed(() => this.values().some(Boolean));

  protected toggleAll(checked: boolean): void {
    for (const control of this.formArray().controls) {
      control.setValue(checked);
      control.markAsTouched();
    }
  }
}
