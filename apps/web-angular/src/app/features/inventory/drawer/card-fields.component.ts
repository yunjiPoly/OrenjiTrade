import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import type { BinderResponse } from '@orenji/api-client';
import { gameInfo } from '../../../shared/domain/games';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../../shared/ui/segmented/segmented.component';
import { binderGame } from '../data/binder-games';
import {
  CARD_FORM_COPY,
  CardFormErrors,
  CardFormValue,
  CardVisibility,
  PUBLIC_NOTE_MAX,
  stepQuantity,
  switchPriceMode,
  typePrice,
} from '../data/card-form';
import { PRICE_COPY, PriceMode, priceInputOf } from '../data/item-price';

const PRICE_MODES: readonly SegmentOption<PriceMode>[] = [
  { value: 'usd', label: '$', spoken: PRICE_COPY.modes.usd.spoken },
  { value: 'pct', label: '% TCG', spoken: PRICE_COPY.modes.pct.spoken },
];

const VISIBILITIES: readonly SegmentOption<CardVisibility>[] = [
  { value: 'PRIVATE', label: 'Private', icon: 'lock' },
  { value: 'PUBLIC', label: 'Public', icon: 'public' },
];

/**
 * The phone's card fields (spec 9.8, 24 apart): Copies − n +, Asking price [$ | % TCG] and a
 * number, Who can see it [Private | Public] with its sentence, Binder (this game's binders and "No
 * binder (unfiled)") and the public note (0 / 500). Edits are emitted as partial values; the
 * drawer keeps the form.
 */
@Component({
  selector: 'app-card-fields',
  imports: [MatIconModule, MatSelectModule, SegmentedComponent],
  template: `
    @let v = value();
    <div class="cf">
      <div class="cf__copies">
        <span class="cf__label" [id]="id('copies')">{{ copy.copies }}</span>
        <span class="cf__stepper" role="group" [attr.aria-labelledby]="id('copies')">
          <button
            type="button"
            class="cf__step"
            [attr.aria-label]="copy.oneLess"
            (click)="patch({ quantity: step(-1) })"
          >
            <mat-icon aria-hidden="true">remove</mat-icon>
          </button>
          <input
            class="cf__qty"
            inputmode="numeric"
            [attr.aria-labelledby]="id('copies')"
            [attr.aria-invalid]="!!errors().quantity"
            [attr.aria-describedby]="errors().quantity ? id('copies-error') : null"
            [value]="v.quantity"
            (input)="onQuantity($event)"
          />
          <button
            type="button"
            class="cf__step"
            [attr.aria-label]="copy.oneMore"
            (click)="patch({ quantity: step(1) })"
          >
            <mat-icon aria-hidden="true">add</mat-icon>
          </button>
        </span>
      </div>
      @if (errors().quantity; as error) {
        <p class="cf__error" [id]="id('copies-error')" role="alert">{{ error }}</p>
      }

      <div class="cf__field">
        <span class="cf__label" [id]="id('price')">{{ copy.askingPrice }}</span>
        <div class="cf__price">
          <app-segmented
            label="Price in"
            [options]="priceModes"
            [value]="v.priceMode"
            (valueChange)="patch(switchMode($event))"
          />
          <span class="cf__input cf__input--price">
            <input
              inputmode="decimal"
              autocomplete="off"
              [attr.aria-label]="priceLabel()"
              [attr.aria-invalid]="!!errors().price"
              [attr.aria-describedby]="id('price-hint')"
              [placeholder]="priceHolder()"
              [value]="v.price"
              (input)="onPrice($event)"
            />
            <span class="cf__unit" aria-hidden="true">{{
              v.priceMode === 'pct' ? '% TCG' : '$'
            }}</span>
          </span>
        </div>
        <p class="cf__hint" [id]="id('price-hint')" [class.cf__hint--error]="!!errors().price">
          @if (errors().price; as error) {
            {{ error }}
          } @else if (v.priceWas) {
            {{ was(v.priceWas) }}
          } @else {
            {{ priceHint() }}
          }
        </p>
      </div>

      <div class="cf__field">
        <span class="cf__label" [id]="id('vis')">{{ copy.whoCanSee }}</span>
        <app-segmented
          block
          size="lg"
          [label]="copy.whoCanSee"
          [options]="visibilities"
          [value]="v.visibility"
          (valueChange)="patch({ visibility: $event })"
        />
        <p class="cf__hint">{{ visibilityHint() }}</p>
      </div>

      <div class="cf__field">
        <span class="cf__label" [id]="id('binder')">{{ copy.binder }}</span>
        <mat-select
          class="cf__select"
          panelClass="cf-binder-panel"
          [aria-labelledby]="id('binder')"
          [value]="v.binderId"
          (valueChange)="patch({ binderId: $event })"
        >
          <mat-select-trigger>
            <span class="cf__trigger">
              <span>{{ binderName() }}</span>
              @if (binderNote(); as note) {
                <span class="cf__opt-note">{{ note }}</span>
              }
            </span>
          </mat-select-trigger>
          <mat-option [value]="null">{{ copy.noBinder }}</mat-option>
          @for (binder of gameBinders(); track binder.id) {
            <mat-option [value]="binder.id">
              {{ binder.name }}
              <span class="cf__opt-note">{{
                binder.visibility === 'PRIVATE' ? 'Private' : 'Public'
              }}</span>
            </mat-option>
          }
        </mat-select>
        <p class="cf__hint">{{ binderHint() }}</p>
      </div>

      <div class="cf__field">
        <span class="cf__label cf__label--row">
          <span [id]="id('note')">{{ copy.publicNote }}</span>
          <span class="cf__counter" [class.cf__counter--over]="noteLength() > max">
            {{ noteLength() }} / {{ max }}
          </span>
        </span>
        <textarea
          class="cf__note"
          rows="3"
          [attr.aria-labelledby]="id('note')"
          [attr.aria-invalid]="!!errors().publicNote"
          [placeholder]="copy.publicNotePlaceholder"
          [value]="v.publicNote"
          (input)="onNote($event)"
        ></textarea>
        @if (errors().publicNote; as error) {
          <p class="cf__error" role="alert">{{ error }}</p>
        }
        <ng-content select="[afterNote]" />
      </div>
    </div>
  `,
  styleUrl: './card-fields.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardFieldsComponent {
  readonly value = input.required<CardFormValue>();
  readonly errors = input<CardFormErrors>({});
  readonly game = input.required<string>();
  readonly binders = input<readonly BinderResponse[]>([]);
  /** "Americas (North)": the collector's region, for the Public sentence. */
  readonly regionName = input<string | null>(null);
  /** A temporary publication of the old web form that ended (Edit card). */
  readonly endedPublication = input(false, { transform: booleanAttribute });
  readonly prefix = input('cf');
  readonly valueChange = output<Partial<CardFormValue>>();

  protected readonly copy = CARD_FORM_COPY;
  protected readonly priceModes = PRICE_MODES;
  protected readonly visibilities = VISIBILITIES;
  protected readonly max = PUBLIC_NOTE_MAX;

  protected readonly gameBinders = computed(() =>
    this.binders().filter((binder) => {
      const game = binderGame(binder);
      return !game || game === this.game();
    }),
  );
  protected readonly noteLength = computed(() => this.value().publicNote.length);
  private readonly chosenBinder = computed(() =>
    this.binders().find((binder) => binder.id === this.value().binderId),
  );
  protected readonly binderName = computed(
    () => this.chosenBinder()?.name ?? CARD_FORM_COPY.noBinder,
  );
  protected readonly binderNote = computed(() => {
    const binder = this.chosenBinder();
    return binder ? (binder.visibility === 'PRIVATE' ? 'Private' : 'Public') : null;
  });
  protected readonly priceLabel = computed(() => PRICE_COPY.inputLabel[this.value().priceMode]);
  protected readonly priceHolder = computed(() => PRICE_COPY.placeholder[this.value().priceMode]);
  protected readonly priceHint = computed(() => PRICE_COPY.hint[this.value().priceMode]);
  protected readonly binderHint = computed(() =>
    CARD_FORM_COPY.binderHint(gameInfo(this.game()).label),
  );
  protected readonly visibilityHint = computed(() => {
    if (this.value().visibility === 'PRIVATE') {
      return this.endedPublication() ? CARD_FORM_COPY.privateHintEnded : CARD_FORM_COPY.privateHint;
    }
    const region = this.regionName();
    return region ? CARD_FORM_COPY.publicHint(region) : CARD_FORM_COPY.publicHintNoRegion;
  });

  protected id(part: string): string {
    return `${this.prefix()}-${part}`;
  }

  protected was(text: string): string {
    return PRICE_COPY.was(text);
  }

  protected step(direction: 1 | -1): string {
    return stepQuantity(this.value().quantity, direction);
  }

  protected switchMode(mode: PriceMode): Partial<CardFormValue> {
    return switchPriceMode(this.value(), mode);
  }

  protected patch(change: Partial<CardFormValue>): void {
    this.valueChange.emit(change);
  }

  protected onQuantity(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/[^0-9]/g, '').slice(0, 4);
    if (digits !== input.value) {
      input.value = digits;
    }
    this.patch({ quantity: digits });
  }

  protected onPrice(event: Event): void {
    const input = event.target as HTMLInputElement;
    const kept = priceInputOf(this.value().priceMode, input.value);
    if (kept !== input.value) {
      input.value = kept;
    }
    this.patch(typePrice(this.value(), kept));
  }

  protected onNote(event: Event): void {
    this.patch({ publicNote: (event.target as HTMLTextAreaElement).value });
  }
}
