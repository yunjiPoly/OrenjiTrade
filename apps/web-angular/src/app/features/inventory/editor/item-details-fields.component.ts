import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  linkedSignal,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { BinderResponse, GameSchema } from '@orenji/api-client';
import { editionLabel, finishLabel, languageLabel } from '../../../shared/catalog/catalog-labels';
import {
  CURRENCIES,
  INVENTORY_AVAILABILITIES,
  TEMPORARY_DURATIONS,
  VISIBILITIES,
  VISIBILITY_INFO,
  conditionLabel,
  endsLabel,
} from '../../../shared/inventory/inventory-labels';
import { AVAILABILITIES } from '../../../shared/ui/availability-chip/availability';
import { ItemForm, KEEP_END, PUBLIC_NOTES_MAX, NOTES_MAX, itemFieldError } from '../data/item-form';

/** Options of a schema list, keeping the current value even if the schema does not list it. */
function withCurrent(options: readonly string[] | undefined, current: string): string[] {
  const list = [...(options ?? [])];
  if (current && !list.includes(current)) {
    list.unshift(current);
  }
  return list;
}

/**
 * Every editable field of an inventory item (add dialog and edit panel): copies, condition,
 * language, edition, finish, availability, price and currency, offers, visibility with the
 * temporary duration, binder, public and private notes. Inline validation messages.
 */
@Component({
  selector: 'app-item-details-fields',
  imports: [
    ReactiveFormsModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  template: `
    @let f = form();
    <div class="idf" [formGroup]="f">
      <fieldset class="idf__group">
        <legend class="idf__legend">Card</legend>
        <div class="idf__grid">
          <mat-form-field appearance="outline">
            <mat-label>Quantity</mat-label>
            <input
              matInput
              type="number"
              inputmode="numeric"
              min="1"
              max="9999"
              step="1"
              formControlName="quantity"
            />
            @if (f.controls.quantity.invalid) {
              <mat-error>{{ error('quantity') }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Condition</mat-label>
            <mat-select formControlName="condition">
              @for (value of conditions(); track value) {
                <mat-option [value]="value">{{ conditionText(value) }}</mat-option>
              }
            </mat-select>
            @if (f.controls.condition.invalid) {
              <mat-error>{{ error('condition') }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Language</mat-label>
            <mat-select formControlName="language">
              @for (value of languages(); track value) {
                <mat-option [value]="value">{{ languageText(value) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Edition</mat-label>
            <mat-select formControlName="edition">
              @for (value of editions(); track value) {
                <mat-option [value]="value">{{ editionText(value) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Finish</mat-label>
            <mat-select formControlName="finish">
              @for (value of finishes(); track value) {
                <mat-option [value]="value">{{ finishText(value) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
      </fieldset>

      <fieldset class="idf__group">
        <legend class="idf__legend">Listing</legend>
        <div class="idf__grid">
          <mat-form-field appearance="outline">
            <mat-label>Availability</mat-label>
            <mat-select formControlName="availability">
              @for (value of availabilities; track value) {
                <mat-option [value]="value">{{ availabilityInfo[value].label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Asking price</mat-label>
            <input
              matInput
              type="number"
              inputmode="decimal"
              min="0"
              step="0.01"
              formControlName="askingPrice"
            />
            <mat-hint>Optional</mat-hint>
            @if (f.controls.askingPrice.invalid) {
              <mat-error>{{ error('askingPrice') }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Currency</mat-label>
            <mat-select formControlName="currency">
              @for (value of currencies(); track value) {
                <mat-option [value]="value">{{ value }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <mat-slide-toggle formControlName="acceptsOffers">Accepts offers</mat-slide-toggle>
      </fieldset>

      <fieldset class="idf__group">
        <legend class="idf__legend">Visibility</legend>
        <mat-button-toggle-group
          class="idf__visibility"
          formControlName="visibility"
          aria-label="Visibility"
          hideSingleSelectionIndicator
        >
          @for (value of visibilities; track value) {
            <mat-button-toggle [value]="value">
              <mat-icon aria-hidden="true">{{ visibilityInfo[value].icon }}</mat-icon>
              {{ visibilityInfo[value].label }}
            </mat-button-toggle>
          }
        </mat-button-toggle-group>
        <p class="idf__hint">{{ visibilityHint() }}</p>
        <div class="idf__grid idf__grid--wide">
          @if (visibility() === 'TEMPORARILY_PUBLIC') {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Public for</mat-label>
              <mat-select formControlName="duration">
                @if (currentEnd(); as ends) {
                  <mat-option [value]="keepEnd">Keep current end ({{ ends }})</mat-option>
                }
                @for (option of durations; track option.value) {
                  <mat-option [value]="option.value">{{ option.label }}</mat-option>
                }
              </mat-select>
              <mat-hint>Then private again automatically.</mat-hint>
            </mat-form-field>
          }
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Binder</mat-label>
            <mat-select formControlName="binderId">
              <mat-option [value]="null">No binder (unfiled)</mat-option>
              @for (binder of binders(); track binder.id) {
                <mat-option [value]="binder.id">{{ binder.name }}</mat-option>
              }
            </mat-select>
            <mat-hint>{{ binderHint() }}</mat-hint>
          </mat-form-field>
        </div>
      </fieldset>

      <fieldset class="idf__group">
        <legend class="idf__legend">Notes</legend>
        <mat-form-field appearance="outline">
          <mat-label>Public notes</mat-label>
          <textarea
            matInput
            rows="2"
            formControlName="publicNotes"
            [maxlength]="publicNotesMax"
          ></textarea>
          <mat-hint>Shown to collectors with the card.</mat-hint>
          <mat-hint align="end"
            >{{ f.controls.publicNotes.value.length }} / {{ publicNotesMax }}</mat-hint
          >
          @if (f.controls.publicNotes.invalid) {
            <mat-error>{{ error('publicNotes') }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Private notes</mat-label>
          <mat-icon matPrefix aria-hidden="true">lock</mat-icon>
          <textarea matInput rows="2" formControlName="notes" [maxlength]="notesMax"></textarea>
          <mat-hint>Only you can see these.</mat-hint>
          @if (f.controls.notes.invalid) {
            <mat-error>{{ error('notes') }}</mat-error>
          }
        </mat-form-field>
      </fieldset>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .idf {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    .idf__group {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .idf__legend {
      margin-bottom: var(--spacing-2);
      padding: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
    }
    .idf__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 0 var(--spacing-3);
    }
    .idf__grid--wide {
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: var(--spacing-3);
    }
    .idf__visibility {
      align-self: flex-start;
      max-width: 100%;
      overflow-x: auto;
    }
    .idf__visibility mat-icon {
      width: 18px;
      height: 18px;
      margin-right: 4px;
      font-size: 18px;
      vertical-align: -4px;
    }
    .idf__hint {
      margin: 0 0 var(--spacing-2);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemDetailsFieldsComponent {
  readonly form = input.required<ItemForm>();
  readonly schema = input<GameSchema | null>(null);
  readonly binders = input<readonly BinderResponse[]>([]);
  /** End of the running temporary publication (edit panel). */
  readonly publicUntil = input<string | null | undefined>(null);

  protected readonly keepEnd = KEEP_END;
  protected readonly visibilities = VISIBILITIES;
  protected readonly visibilityInfo = VISIBILITY_INFO;
  protected readonly availabilities = INVENTORY_AVAILABILITIES;
  protected readonly availabilityInfo = AVAILABILITIES;
  protected readonly durations = TEMPORARY_DURATIONS;
  protected readonly notesMax = NOTES_MAX;
  protected readonly publicNotesMax = PUBLIC_NOTES_MAX;
  protected readonly conditionText = conditionLabel;
  protected readonly languageText = languageLabel;
  protected readonly editionText = editionLabel;
  protected readonly finishText = finishLabel;

  /** The form's current value as a signal (the controls drive the hints below). */
  private readonly value = linkedSignal(() => this.form().getRawValue());
  protected readonly visibility = computed(() => this.value().visibility);
  protected readonly binderId = computed(() => this.value().binderId);

  protected readonly conditions = computed(() =>
    withCurrent(this.schema()?.conditions, this.form().controls.condition.value),
  );
  protected readonly languages = computed(() =>
    withCurrent(this.schema()?.languages, this.form().controls.language.value),
  );
  protected readonly editions = computed(() =>
    withCurrent(this.schema()?.editions, this.form().controls.edition.value),
  );
  protected readonly finishes = computed(() =>
    withCurrent(this.schema()?.finishes, this.form().controls.finish.value),
  );
  protected readonly currencies = computed(() =>
    withCurrent(CURRENCIES, this.form().controls.currency.value),
  );
  protected readonly currentEnd = computed(() => {
    const until = this.publicUntil();
    return until && Date.parse(until) > Date.now() ? endsLabel(until) : null;
  });
  protected readonly visibilityHint = computed(() => {
    switch (this.visibility()) {
      case 'PRIVATE':
        return 'Private: prepare it now and publish it later. Only you can see it.';
      case 'PUBLIC':
        return 'Public: collectors near you can find it once its binder (if any) is public.';
      default:
        return 'Temporarily public: visible for the time you choose, then private again.';
    }
  });
  protected readonly binderHint = computed(() => {
    const id = this.binderId();
    const binder = id ? this.binders().find((candidate) => candidate.id === id) : null;
    if (!binder) {
      return 'Unfiled cards show on their own when public.';
    }
    return binder.visibility === 'PRIVATE'
      ? 'This binder is private: publish it to show its public cards.'
      : 'This binder is public.';
  });

  constructor() {
    effect((onCleanup) => {
      const form = this.form();
      const subscription = form.valueChanges.subscribe(() => this.value.set(form.getRawValue()));
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected error(
    field: 'quantity' | 'askingPrice' | 'notes' | 'publicNotes' | 'condition',
  ): string | null {
    return itemFieldError(field, this.form().controls[field].errors);
  }
}
