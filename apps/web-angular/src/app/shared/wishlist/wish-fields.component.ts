import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { MarketPrice, WishPriceTerm } from '@orenji/api-client';
import { marketPriceInfo } from '../catalog/catalog-labels';
import { WISH_NOTE_MAX, WishForm, noteError, noteLength } from './wishlist-form';
import { approximateAmount } from './wishlist-labels';

/**
 * The terms to offer: the admin list, plus `current` when the list no longer has it (a wish keeps
 * a term the admin removed), placed by its percent ("90% TCG" between 85 and 100, an "or more"
 * term after the plain one of the same percent) rather than at the end.
 */
export function withCurrentTerm(
  terms: readonly WishPriceTerm[],
  current: string | null | undefined,
): readonly WishPriceTerm[] {
  if (!current || terms.some((term) => term.label === current)) {
    return terms;
  }
  const match = /^([1-9]\d{0,2})% TCG(\+)?$/.exec(current);
  if (!match) {
    return terms;
  }
  const kept: WishPriceTerm = { label: current, percent: Number(match[1]), orMore: !!match[2] };
  const rank = (term: WishPriceTerm) => (term.percent ?? 0) * 2 + (term.orMore ? 1 : 0);
  const after = terms.findIndex((term) => rank(term) > rank(kept));
  return after < 0 ? [...terms, kept] : [...terms.slice(0, after), kept, ...terms.slice(after)];
}

/** A label inside a sentence: lower-case first letter, except an acronym ("TCG market price"). */
export function inSentence(label: string): string {
  return /^[A-Z]{2,}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * The public part of a wish (add/edit dialog): the public note first (plain text, at most 280
 * characters, shown wherever the wish is visible), then the optional "Near Mint only" and price
 * term checkboxes. At most one price term: checking one clears the others (the boxes are rendered
 * from the form value on each change, so quick successive clicks never leave two checked). With one
 * printing chosen and a market price known, each term shows its approximate amount ("85% TCG ≈
 * 21.25 USD") and the price's source and date; with "Any printing" only the term and a hint that
 * the amounts follow the choice of one printing.
 */
@Component({
  selector: 'app-wish-fields',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
  ],
  template: `
    @let f = form();
    <div class="wf" [formGroup]="f">
      <!-- Dynamic subscript: an error of two lines on a phone grows the field instead of
           running into "Near Mint only". -->
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="wf__note">
        <mat-label>Public note (optional)</mat-label>
        <textarea
          matInput
          rows="2"
          formControlName="note"
          data-testid="wish-note"
          [attr.maxlength]="noteMax * 2"
        ></textarea>
        <mat-hint>Everyone who can see your wishlist sees this note.</mat-hint>
        <mat-hint align="end" class="wf__count">{{ length() }} / {{ noteMax }}</mat-hint>
        @if (f.controls.note.invalid) {
          <mat-error>
            {{ error() }}
            @if (length() > noteMax) {
              <!-- The error replaces the counter: keep saying by how much the note is over. -->
              <span class="wf__count" data-testid="wish-note-over"
                >{{ length() }} / {{ noteMax }}</span
              >
            }
          </mat-error>
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
        @if (shownTerms().length) {
          <div class="wf__term-list">
            @for (term of shownTerms(); track term.label) {
              <mat-checkbox
                [value]="term.label"
                [checked]="selectedTerm() === term.label"
                (change)="toggleTerm($event)"
                [attr.data-testid]="'wish-term-' + term.label"
              >
                {{ term.label }}
                @if (amount(term); as approx) {
                  <span class="wf__amount">{{ approx }}</span>
                }
              </mat-checkbox>
            }
          </div>
        }
        @if (termsError() && !terms().length) {
          <p class="wf__hint" role="alert" data-testid="wish-terms-error">
            The price terms could not load.
            <button matButton type="button" (click)="retryTerms.emit()">Retry</button>
          </p>
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
    /* "281 / 280" stays on one line, also on a phone-sized dialog. */
    .wf__count {
      white-space: nowrap;
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
  /** One printing is chosen (else any printing, where no amount can be shown). */
  readonly onePrinting = input(false);
  /** The collector asks to load the price terms again (after `termsError`). */
  readonly retryTerms = output<void>();

  protected readonly noteMax = WISH_NOTE_MAX;
  private readonly changeDetector = inject(ChangeDetectorRef);

  /** The form's current value as a signal. */
  private readonly value = linkedSignal(() => this.form().getRawValue());
  protected readonly length = computed(() => noteLength(this.value().note));
  protected readonly selectedTerm = computed(() => this.value().priceTerm);
  /** The admin list, plus the wish's own term when the list no longer offers it (kept on edit). */
  protected readonly shownTerms = computed(() =>
    withCurrentTerm(this.terms(), this.selectedTerm()),
  );
  protected readonly priceInfo = computed(() => marketPriceInfo(this.marketPrice()));
  protected readonly termsHint = computed(() => {
    const info = this.priceInfo();
    if (info) {
      return `Terms relative to the ${inSentence(info.label)} of this printing. Sellers see them; they never filter anything.`;
    }
    const base =
      'Terms relative to the TCG market price of the copy you get. Sellers see them; they never filter anything.';
    return this.onePrinting()
      ? `${base} This printing has no market price yet.`
      : `${base} Choose one printing under “Which copy” to see approximate amounts.`;
  });

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

  protected toggleTerm(event: MatCheckboxChange): void {
    const label = event.source.value;
    const control = this.form().controls.priceTerm;
    control.setValue(event.checked ? label : control.value === label ? '' : control.value);
    control.markAsDirty();
    // Render the boxes now: with the one-way [checked] binding, a box checked and replaced within
    // one change detection (two quick clicks) would keep its native check mark.
    this.changeDetector.detectChanges();
  }
}
