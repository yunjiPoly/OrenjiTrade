import { ChangeDetectionStrategy, Component, effect, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { map } from 'rxjs';

/**
 * Search box (`role="search"` form). Emits the trimmed query on submit (Enter).
 */
@Component({
  selector: 'app-search-field',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
  ],
  template: `
    <form class="search-field" role="search" (submit)="submit($event)">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search-field__field">
        <mat-icon matPrefix aria-hidden="true">search</mat-icon>
        <input
          matInput
          type="search"
          [formControl]="query"
          [placeholder]="placeholder()"
          [attr.aria-label]="label()"
          autocomplete="off"
          enterkeyhint="search"
        />
        @if (hasValue()) {
          <button matSuffix matIconButton type="button" aria-label="Clear search" (click)="clear()">
            <mat-icon>close</mat-icon>
          </button>
        }
      </mat-form-field>
    </form>
  `,
  styles: `
    :host {
      display: block;
    }
    .search-field__field {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchFieldComponent {
  readonly placeholder = input('Search cards, sets or collectors');
  readonly label = input('Search cards and collectors');
  /** Pre-fills the field (e.g. from the `q` query parameter). */
  readonly initialQuery = input('');
  readonly querySubmit = output<string>();

  protected readonly query = new FormControl('', { nonNullable: true });
  protected readonly hasValue = toSignal(this.query.valueChanges.pipe(map((v) => v.length > 0)), {
    initialValue: false,
  });

  constructor() {
    effect(() => {
      const initial = this.initialQuery();
      if (initial !== this.query.value) {
        this.query.setValue(initial);
      }
    });
  }

  /** Plain `<form>` (no form directive): handle the native submit and keep the page in place. */
  protected submit(event: Event): void {
    event.preventDefault();
    const value = this.query.value.trim();
    if (value) {
      this.querySubmit.emit(value);
    }
  }

  protected clear(): void {
    this.query.setValue('');
  }
}
