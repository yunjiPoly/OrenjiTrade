import { ChangeDetectionStrategy, Component, booleanAttribute, input, model } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { PROFILE_LANGUAGES } from '../../domain/games';

/** Multi-select chips for the languages a collector trades in. */
@Component({
  selector: 'app-language-picker',
  imports: [MatChipsModule],
  template: `
    <mat-chip-listbox
      multiple
      [attr.aria-label]="label()"
      [value]="value()"
      [disabled]="disabled()"
      (change)="value.set($event.value ?? [])"
    >
      @for (language of languages; track language.code) {
        <mat-chip-option [value]="language.code" [lang]="language.code">
          {{ language.label }}
        </mat-chip-option>
      }
    </mat-chip-listbox>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguagePickerComponent {
  readonly value = model<string[]>([]);
  readonly label = input('Languages you trade in');
  readonly disabled = input(false, { transform: booleanAttribute });
  protected readonly languages = PROFILE_LANGUAGES;
}
