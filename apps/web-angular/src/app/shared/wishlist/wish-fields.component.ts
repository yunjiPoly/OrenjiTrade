import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  linkedSignal,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { MarketPrice, WishPriceTerm } from '@orenji/api-client';
import { marketPriceInfo } from '../catalog/catalog-labels';
import { WISH_NOTE_MAX, WishForm, noteError, noteLength } from './wishlist-form';
import { approximateAmount } from './wishlist-labels';

/**
 * The public part of a wish (add/edit dialog): the public note first (plain text, at most 280
 * characters, shown wherever the wish is visible), then the optional "Near Mint only" and price
 * term checkboxes. At most one price term: checking one clears the others. With one printing
 * chosen and a market price known, each term shows its approximate amount ("85% TCG ≈ 21.25 USD")
 * and the price's source and date; with "Any printing" only the term.
 */
@Component({
  selector: 'app-wish-fields',
  imports: [
    ReactiveFormsModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
  ],
  template: `
    @let f = form();
    <div class="wf" [formGroup]="f">
      <mat-form-field appearance="outline" class="wf__note">
        <mat-label>Public note (optional)</mat-label>
        <textarea
          matInput
          rows="2"
          formControlName="note"
          data-testid="wish-note"
          [attr.maxlength]="noteMax * 2"
        ></textarea>
        <mat-hint>Everyone who can see your wishlist sees this note.</mat-hint>
        <mat-hint align="end">{{ length() }} / {{ noteMax }}</mat-hint>
        @if (f.controls.note.invalid) {
          <mat-error>{{ error() }}</mat-error>
        }
      </mat-form-field>

      <mat-checkbox formControlName="nearMintOnly" data-testid="wish-near-mint">
        Near Mint only
      </mat-checkbox>

      <fieldset class="wf__terms" aria-describedby="wish-terms-hint">
        <legend class="wf__legend">Price (optional, at most one)</legend>
        <p class="wf__hint" id="wish-terms-hint">
          {{ termsHint() }}
          @if (priceInfo(); as info) {
            <span class="wf__source" [matTooltip]="info.detail" tabindex="0">
              <mat-icon aria-hidden="true">info</mat-icon>
              <span class="visually-hidden">{{ info.label }}: {{ info.detail }}</span>
            </span>
          }
        </p>
        @if (terms().length) {
          <div class="wf__term-list">
            @for (term of terms(); track term.label) {
              <mat-checkbox
                [checked]="selectedTerm() === term.label"
                (change)="toggleTerm(term.label, $event.checked)"
                [attr.data-testid]="'wish-term-' + term.label"
              >
                {{ term.label }}
                @if (amount(term); as approx) {
                  <span class="wf__amount">{{ approx }}</span>
                }
              </mat-checkbox>
            }
          </div>
        } @else if (termsError()) {
          <p class="wf__hint" role="alert">The price terms could not load. Try again later.</p>
        }
        @if (f.controls.priceTerm.errors?.['server']; as message) {
          <p class="wf__error" role="alert">{{ message }}</p>
        }
      </fieldset>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .wf {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
    }
    .wf__note {
      width: 100%;
    }
    .wf__terms {
      min-width: 0;
      margin: var(--spacing-2) 0 0;
      padding: 0;
      border: 0;
    }
    .wf__legend {
      padding: 0;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .wf__hint {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      margin: var(--spacing-1) 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .wf__source {
      display: inline-flex;
      cursor: help;
    }
    .wf__source mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .wf__term-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0 var(--spacing-3);
    }
    .wf__amount {
      margin-left: 4px;
      color: var(--color-text-muted);
    }
    .wf__error {
      margin: var(--spacing-1) 0 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishFieldsComponent {
  readonly form = input.required<WishForm>();
  /** The admin list of price terms. */
  readonly terms = input<readonly WishPriceTerm[]>([]);
  readonly termsError = input(false);
  /** Market price of the chosen printing; `null` for "any printing" or without a price. */
  readonly marketPrice = input<MarketPrice | null | undefined>(null);

  protected readonly noteMax = WISH_NOTE_MAX;

  /** The form's current value as a signal. */
  private readonly value = linkedSignal(() => this.form().getRawValue());
  protected readonly length = computed(() => noteLength(this.value().note));
  protected readonly selectedTerm = computed(() => this.value().priceTerm);
  protected readonly priceInfo = computed(() => marketPriceInfo(this.marketPrice()));
  protected readonly termsHint = computed(() =>
    this.priceInfo()
      ? `Terms relative to the ${this.priceInfo()?.label.toLowerCase()} of this printing. Sellers see them; they never filter anything.`
      : 'Terms relative to the TCG market price of the copy you get. Sellers see them; they never filter anything.',
  );

  constructor() {
    effect((onCleanup) => {
      const form = this.form();
      this.value.set(form.getRawValue());
      const subscription = form.valueChanges.subscribe(() => this.value.set(form.getRawValue()));
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected amount(term: WishPriceTerm): string | null {
    return approximateAmount(term, this.marketPrice());
  }

  protected error(): string | null {
    return noteError(this.form().controls.note.errors);
  }

  protected toggleTerm(label: string, checked: boolean): void {
    const control = this.form().controls.priceTerm;
    control.setValue(checked ? label : control.value === label ? '' : control.value);
    control.markAsDirty();
  }
}
