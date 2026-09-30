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
import { MatSliderModule } from '@angular/material/slider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { GameSchema, PrintingSummary } from '@orenji/api-client';
import { editionLabel, languageLabel } from '../catalog/catalog-labels';
import { CURRENCIES, conditionLabel } from '../inventory/inventory-labels';
import { ANY, WISH_NOTES_MAX, WishField, WishForm, wishFieldError } from './wishlist-form';
import { TRADE_PREFERENCES, printingOptionLabel, tradePreferenceInfo } from './wishlist-labels';

/** Options of a schema list, keeping the current value even if the schema does not list it. */
function withCurrent(options: readonly string[] | undefined, current: string): string[] {
  const list = [...(options ?? [])];
  if (current && !list.includes(current)) {
    list.unshift(current);
  }
  return list;
}

/**
 * Every criterion of a wish (add/edit dialog): printing or any, minimum condition, edition,
 * language and rarity from the game's `GameSchema`, maximum price and currency, what the
 * collector accepts (trade / buy), the matching radius bounded by the plan, private notes and
 * the alert switch. Inline validation messages.
 */
@Component({
  selector: 'app-wish-criteria-fields',
  imports: [
    ReactiveFormsModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSliderModule,
    MatSlideToggleModule,
  ],
  template: `
    @let f = form();
    <div class="wcf" [formGroup]="f">
      <fieldset class="wcf__group">
        <legend class="wcf__legend">Which copy</legend>
        <mat-form-field appearance="outline" class="wcf__wide">
          <mat-label>Printing</mat-label>
          <mat-select formControlName="printingId">
            <mat-option [value]="any">Any printing</mat-option>
            @for (printing of printings(); track printing.id) {
              <mat-option [value]="printing.id">{{ optionLabel(printing) }}</mat-option>
            }
          </mat-select>
          <mat-hint>{{
            anyPrinting() ? 'Every printing of the card matches.' : 'Only this printing matches.'
          }}</mat-hint>
        </mat-form-field>
        <div class="wcf__grid">
          <mat-form-field appearance="outline">
            <mat-label>Minimum condition</mat-label>
            <mat-select formControlName="conditionMin">
              <mat-option [value]="any">Any condition</mat-option>
              @for (value of conditions(); track value) {
                <mat-option [value]="value">{{ conditionText(value) }} or better</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Edition</mat-label>
            <mat-select formControlName="edition">
              <mat-option [value]="any">Any edition</mat-option>
              @for (value of editions(); track value) {
                <mat-option [value]="value">{{ editionText(value) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Language</mat-label>
            <mat-select formControlName="language">
              <mat-option [value]="any">Any language</mat-option>
              @for (value of languages(); track value) {
                <mat-option [value]="value">{{ languageText(value) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (anyPrinting()) {
            <mat-form-field appearance="outline">
              <mat-label>Rarity</mat-label>
              <mat-select formControlName="rarity">
                <mat-option [value]="any">Any rarity</mat-option>
                @for (value of rarities(); track value) {
                  <mat-option [value]="value">{{ value }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
        </div>
      </fieldset>

      <fieldset class="wcf__group">
        <legend class="wcf__legend">Deal</legend>
        <div class="wcf__grid">
          <mat-form-field appearance="outline">
            <mat-label>Maximum price</mat-label>
            <input
              matInput
              type="number"
              inputmode="decimal"
              min="0"
              step="0.01"
              formControlName="maxPrice"
            />
            <mat-hint>Optional</mat-hint>
            @if (f.controls.maxPrice.invalid) {
              <mat-error>{{ error('maxPrice') }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Currency</mat-label>
            <mat-select formControlName="currency">
              @for (value of currencies(); track value) {
                <mat-option [value]="value">{{ value }}</mat-option>
              }
            </mat-select>
            @if (f.controls.currency.invalid) {
              <mat-error>{{ error('currency') }}</mat-error>
            }
          </mat-form-field>
        </div>
        <p class="wcf__hint">
          Listings without a price still match; prices in another currency do not.
        </p>
        <span class="wcf__label" id="wish-trade-label">I want to</span>
        <mat-button-toggle-group
          class="wcf__toggle"
          formControlName="tradePreference"
          aria-labelledby="wish-trade-label"
          hideSingleSelectionIndicator
        >
          @for (option of tradeOptions; track option.value) {
            <mat-button-toggle [value]="option.value">
              <mat-icon aria-hidden="true">{{ option.icon }}</mat-icon>
              {{ option.label }}
            </mat-button-toggle>
          }
        </mat-button-toggle-group>
        <p class="wcf__hint">{{ tradeHint() }}</p>
      </fieldset>

      <fieldset class="wcf__group">
        <legend class="wcf__legend">Distance</legend>
        <div class="wcf__radius">
          <span id="wish-radius-label">Collectors within</span>
          <strong data-testid="wish-radius-value">{{ radius() }} km</strong>
        </div>
        <mat-slider
          class="wcf__slider"
          [min]="1"
          [max]="radiusMax()"
          [step]="1"
          discrete
          [displayWith]="kmLabel"
        >
          <input
            matSliderThumb
            formControlName="radiusKm"
            aria-label="Distance in kilometres"
            [attr.aria-valuetext]="radius() + ' kilometres'"
          />
        </mat-slider>
        <p class="wcf__hint">{{ radiusHint() }}</p>
      </fieldset>

      <fieldset class="wcf__group">
        <legend class="wcf__legend">Notes and alerts</legend>
        <mat-form-field appearance="outline" class="wcf__wide">
          <mat-label>Private notes</mat-label>
          <mat-icon matPrefix aria-hidden="true">lock</mat-icon>
          <textarea matInput rows="2" formControlName="notes" [maxlength]="notesMax"></textarea>
          <mat-hint>Only you can see these.</mat-hint>
          <mat-hint align="end">{{ f.controls.notes.value.length }} / {{ notesMax }}</mat-hint>
          @if (f.controls.notes.invalid) {
            <mat-error>{{ error('notes') }}</mat-error>
          }
        </mat-form-field>
        <mat-slide-toggle formControlName="active">Match alerts on</mat-slide-toggle>
        <p class="wcf__hint">
          {{
            active()
              ? 'We notify you when a collector nearby lists a match.'
              : 'Paused: this wish does not match or notify until you turn it back on.'
          }}
        </p>
      </fieldset>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .wcf {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    .wcf__group {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .wcf__legend {
      margin-bottom: var(--spacing-2);
      padding: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
    }
    .wcf__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
      gap: 0 var(--spacing-3);
    }
    .wcf__wide {
      width: 100%;
      margin-bottom: var(--spacing-2);
    }
    .wcf__label {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
    }
    .wcf__toggle {
      align-self: flex-start;
      max-width: 100%;
      overflow-x: auto;
    }
    .wcf__toggle mat-icon {
      width: 18px;
      height: 18px;
      margin-right: 4px;
      font-size: 18px;
      vertical-align: -4px;
    }
    .wcf__hint {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .wcf__radius {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--spacing-2);
      font-size: var(--font-size-sm);
    }
    .wcf__radius strong {
      color: var(--color-primary);
      font-size: var(--font-size-lg);
    }
    .wcf__slider {
      width: calc(100% - 16px);
      margin: 0 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishCriteriaFieldsComponent {
  readonly form = input.required<WishForm>();
  readonly schema = input<GameSchema | null>(null);
  readonly printings = input<readonly PrintingSummary[]>([]);
  /** Upper bound of the slider (plan cap, at most 100 km). */
  readonly radiusMax = input(25);
  /** The plan's `map.radius.max_km` (`null` = unlimited, `undefined` = not known yet). */
  readonly radiusCap = input<number | null | undefined>(undefined);

  protected readonly any = ANY;
  protected readonly tradeOptions = TRADE_PREFERENCES;
  protected readonly notesMax = WISH_NOTES_MAX;
  protected readonly conditionText = conditionLabel;
  protected readonly editionText = editionLabel;
  protected readonly languageText = languageLabel;
  protected readonly optionLabel = printingOptionLabel;
  protected readonly kmLabel = (value: number): string => `${value} km`;

  /** The form's current value as a signal (drives the hints and conditional fields). */
  private readonly value = linkedSignal(() => this.form().getRawValue());
  protected readonly anyPrinting = computed(() => !this.value().printingId);
  protected readonly radius = computed(() => this.value().radiusKm);
  protected readonly active = computed(() => this.value().active);
  protected readonly tradeHint = computed(
    () => tradePreferenceInfo(this.value().tradePreference).hint,
  );
  protected readonly radiusHint = computed(() => {
    const cap = this.radiusCap();
    if (cap === undefined) {
      return 'Distances are measured between approximate public locations.';
    }
    return cap === null
      ? 'Distances are measured between approximate public locations.'
      : `Your plan matches collectors up to ${cap} km away. Distances are approximate.`;
  });

  protected readonly conditions = computed(() =>
    withCurrent(this.schema()?.conditions, this.form().controls.conditionMin.value),
  );
  protected readonly editions = computed(() =>
    withCurrent(this.schema()?.editions, this.form().controls.edition.value),
  );
  protected readonly languages = computed(() =>
    withCurrent(this.schema()?.languages, this.form().controls.language.value),
  );
  protected readonly rarities = computed(() =>
    withCurrent(this.schema()?.rarities, this.form().controls.rarity.value),
  );
  protected readonly currencies = computed(() =>
    withCurrent(CURRENCIES, this.form().controls.currency.value),
  );

  constructor() {
    effect((onCleanup) => {
      const form = this.form();
      this.value.set(form.getRawValue());
      const subscription = form.valueChanges.subscribe(() => this.value.set(form.getRawValue()));
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected error(field: WishField): string | null {
    return wishFieldError(field, this.form().controls[field].errors);
  }
}
