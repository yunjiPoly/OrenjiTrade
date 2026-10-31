import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { of, startWith, switchMap } from 'rxjs';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';

export interface ConsentItem {
  documentType: string;
  title: string;
  url: string;
}

/**
 * The documents card of Create your account and Review our terms (spec 14, board W27): "Accept
 * all" first, then one row per document ("I accept the Terms of Service") with "Read", which
 * opens the document in a new tab. "Accept all" ticks the documents only, never the 18+
 * confirmation, which has its own card. After a refused submit (`warn`) the boxes still unticked
 * are ringed in amber. The parent owns the `FormArray` (one `requiredTrue` control per item).
 */
@Component({
  selector: 'app-legal-consent-list',
  imports: [ReactiveFormsModule, RouterLink, ShellIconComponent],
  template: `
    <fieldset class="docs" [class.docs--warn]="warn()">
      <legend class="visually-hidden">Documents</legend>
      @if (items().length > 1) {
        <label class="docs__row docs__row--all">
          <input
            type="checkbox"
            class="box"
            [checked]="allChecked()"
            [indeterminate]="someChecked() && !allChecked()"
            (change)="toggleAll($any($event.target).checked)"
          />
          <span>Accept all</span>
        </label>
      }
      @for (item of items(); track item.documentType; let i = $index) {
        <div class="docs__row docs__row--doc">
          <label class="docs__label">
            <input type="checkbox" class="box" [formControl]="controls()[i]" />
            <span>I accept the {{ item.title }}</span>
          </label>
          <a
            class="docs__read"
            [routerLink]="item.url"
            target="_blank"
            rel="noopener"
            [attr.aria-label]="'Read the ' + item.title + ', opens in a new tab'"
          >
            Read
            <app-shell-icon name="external" [size]="14" [stroke]="2" />
          </a>
        </div>
      }
    </fieldset>
  `,
  styleUrl: '../../../shared/legal/consent-boxes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalConsentListComponent {
  readonly items = input.required<readonly ConsentItem[]>();
  readonly formArray = input.required<FormArray<FormControl<boolean>>>();
  /** Ring the boxes still unticked (the parent sets it after a refused submit). */
  readonly warn = input(false);

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
