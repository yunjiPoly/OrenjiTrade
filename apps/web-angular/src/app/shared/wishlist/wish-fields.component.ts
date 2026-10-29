import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { WishPriceTerm } from '@orenji/api-client';
import { WISH_NOTE_MAX, WishForm, noteError, noteLength } from './wishlist-form';

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

let nextId = 0;

/**
 * The public part of a wish (the 520 dialog of spec 6.6, board W6), under "Which copy":
 * - "Near Mint only", with "Sellers see it; listings in other conditions still show.";
 * - "Price you would pay (optional)": the chips "No price", then the admin list of terms ("80%
 *   TCG", "85% TCG", …; one at most, radio chips: the arrows move). Never an amount and never a
 *   market price (decision 10, "Never build: market prices");
 * - the public note (plain text, 0 / 280, "Everyone who can see your wishlist sees it.").
 */
@Component({
  selector: 'app-wish-fields',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    @let f = form();
    <div class="wf" [formGroup]="f">
      <div class="wf__nm">
        <mat-checkbox
          formControlName="nearMintOnly"
          data-testid="wish-near-mint"
          [aria-describedby]="ids.nm"
        >
          Near Mint only
        </mat-checkbox>
        <span class="wf__help wf__help--nm" [id]="ids.nm"
          >Sellers see it; listings in other conditions still show.</span
        >
      </div>

      <fieldset class="wf__terms" [attr.aria-describedby]="ids.terms">
        <legend class="wf__legend">Price you would pay (optional)</legend>
        <div class="wf__chips">
          <label class="wf__chip" data-testid="wish-term-none">
            <input
              type="radio"
              class="wf__radio"
              [name]="ids.name"
              value=""
              [checked]="selectedTerm() === ''"
              (change)="pickTerm('')"
            />
            No price
          </label>
          @for (term of shownTerms(); track term.label) {
            <label class="wf__chip" [attr.data-testid]="'wish-term-' + term.label">
              <input
                type="radio"
                class="wf__radio"
                [name]="ids.name"
                [value]="term.label"
                [checked]="selectedTerm() === term.label"
                (change)="pickTerm(term.label)"
              />
              {{ term.label }}
            </label>
          }
        </div>
        <p class="wf__help" [id]="ids.terms">
          Compared with the TCGplayer market price. Sellers see it; it never hides a listing.
        </p>
        @if (termsError() && !terms().length) {
          <p class="wf__help" role="alert" data-testid="wish-terms-error">
            The price terms could not load.
            <button matButton type="button" (click)="retryTerms.emit()">Retry</button>
          </p>
        }
        @if (f.controls.priceTerm.errors?.['server']; as message) {
          <p class="wf__error" role="alert">{{ message }}</p>
        }
      </fieldset>

      <!-- Dynamic subscript: an error of two lines grows the field instead of overlapping. -->
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="wf__note">
        <mat-label>Public note (optional)</mat-label>
        <textarea
          matInput
          rows="3"
          formControlName="note"
          data-testid="wish-note"
          placeholder="Like “English only”"
          [attr.maxlength]="noteMax * 2"
        ></textarea>
        <mat-hint>Everyone who can see your wishlist sees it.</mat-hint>
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
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .wf {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    .wf__nm {
      display: flex;
      flex-direction: column;
    }
    .wf__help {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-1);
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
      line-height: 18px;
    }
    .wf__help--nm {
      padding-left: 40px;
    }
    .wf__terms {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .wf__legend {
      margin-bottom: var(--spacing-2);
      padding: 0;
      font-size: var(--font-size-meta);
      font-weight: var(--font-weight-semibold);
    }
    .wf__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .wf__chip {
      position: relative;
      display: inline-flex;
      align-items: center;
      min-height: 36px;
      padding: 0 14px;
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-pill);
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      cursor: pointer;
    }
    .wf__chip:has(.wf__radio:checked) {
      border-color: var(--color-accent);
      background: var(--color-accent-tint);
      font-weight: var(--font-weight-semibold);
    }
    .wf__chip:has(.wf__radio:focus-visible) {
      outline: 2px solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .wf__radio {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      opacity: 0;
      cursor: pointer;
    }
    .wf__note {
      width: 100%;
    }
    /* "281 / 280" stays on one line, also on a phone-sized dialog. */
    .wf__count {
      white-space: nowrap;
    }
    .wf__error {
      margin: 0;
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
  /** The collector asks to load the price terms again (after `termsError`). */
  readonly retryTerms = output<void>();

  protected readonly noteMax = WISH_NOTE_MAX;
  private readonly uid = nextId++;
  protected readonly ids = {
    nm: `wish-nm-help-${this.uid}`,
    terms: `wish-terms-help-${this.uid}`,
    name: `wish-term-${this.uid}`,
  };

  /** The form's current value as a signal. */
  private readonly value = linkedSignal(() => this.form().getRawValue());
  protected readonly length = computed(() => noteLength(this.value().note));
  protected readonly selectedTerm = computed(() => this.value().priceTerm);
  /** The admin list, plus the wish's own term when the list no longer offers it (kept on edit). */
  protected readonly shownTerms = computed(() =>
    withCurrentTerm(this.terms(), this.selectedTerm()),
  );

  constructor() {
    effect((onCleanup) => {
      const form = this.form();
      this.value.set(form.getRawValue());
      const subscription = form.valueChanges.subscribe(() => this.value.set(form.getRawValue()));
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected error(): string | null {
    return noteError(this.form().controls.note.errors);
  }

  protected pickTerm(label: string): void {
    const control = this.form().controls.priceTerm;
    control.setValue(label);
    control.markAsDirty();
  }
}
