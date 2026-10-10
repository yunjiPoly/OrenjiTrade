import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  linkedSignal,
  output,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { PrintingSummary } from '@orenji/api-client';
import { printingCode, printingImageUrl } from '../../inventory/inventory-labels';
import { CardImageComponent } from '../../ui/card-image/card-image.component';
import {
  editionLabel,
  finishLabel,
  formatMarketPrice,
  languageLabel,
  marketPriceInfo,
} from '../catalog-labels';
import {
  NO_FILTERS,
  PrintingFacet,
  PrintingFilters,
  PrintingSelection,
  facetOptions,
  normaliseSelection,
  sameSelection,
  selectionForRarity,
  visiblePrintings,
} from './printing-selection';

let nextId = 0;

/**
 * "Which copy" of a card (owner product change of 2026-10-08): "Any printing" first and selected
 * by default (never a silent first printing), then every printing with its picture (the API's
 * card-image URLs, never hotlinked), set, code, rarity, edition, language, finish and market
 * price (labelled with its source and date). Filters above the list (rarity, set, edition,
 * language) narrow it; choosing only a rarity means "any printing of this rarity". With
 * `holderCounts` (the card page, stage S3) each printing shows its collectors in the region and
 * printings with holders come first.
 *
 * A native radio group: Tab reaches it, the arrow keys move the selection, every option names its
 * printing in full. Shared by the wish form (S2) and the card page (S3).
 */
@Component({
  selector: 'app-printing-picker',
  imports: [
    CardImageComponent,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  template: `
    <fieldset class="pp" [attr.aria-describedby]="hintId">
      <legend class="pp__legend">{{ legend() }}</legend>
      <p class="pp__hint" [id]="hintId">{{ hint() }}</p>

      @if (facets().length) {
        <div class="pp__filters" data-testid="printing-filters">
          @for (facet of facets(); track facet.key) {
            <mat-form-field
              appearance="outline"
              subscriptSizing="dynamic"
              class="pp__filter"
              [class.pp__filter--wide]="facet.key === 'rarity' || facet.key === 'set'"
            >
              <mat-label>{{ facet.label }}</mat-label>
              <mat-select
                [value]="filters()[facet.key]"
                (valueChange)="setFilter(facet.key, $event)"
                [attr.data-testid]="'printing-filter-' + facet.key"
              >
                <mat-option value="">{{ facet.all }}</mat-option>
                @for (option of facet.options; track option.value) {
                  <mat-option [value]="option.value">{{ option.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
          @if (filtered()) {
            <button matButton type="button" class="pp__clear" (click)="clearFilters()">
              Clear filters
            </button>
          }
        </div>
      }

      <div class="pp__list" role="radiogroup" [attr.aria-label]="legend()">
        <label
          class="pp__option pp__option--any"
          [class.pp__option--checked]="!selection().printingId"
        >
          <input
            type="radio"
            class="pp__radio"
            [name]="groupName"
            [checked]="!selection().printingId"
            (change)="chooseAny()"
            data-testid="printing-option-any"
          />
          <span class="pp__any-icon" aria-hidden="true"><mat-icon>style</mat-icon></span>
          <span class="pp__text">
            <span class="pp__title">Any printing</span>
            <span class="pp__meta">{{ anyDescription() }}</span>
          </span>
        </label>

        @for (printing of visible(); track printing.id) {
          @let checked = printing.id === selection().printingId;
          <label
            class="pp__option"
            [class.pp__option--checked]="checked"
            [attr.data-testid]="'printing-option-' + printing.id"
          >
            <input
              type="radio"
              class="pp__radio"
              [name]="groupName"
              [checked]="checked"
              (change)="choosePrinting(printing)"
              [attr.aria-label]="optionLabel(printing)"
            />
            <app-card-image
              class="pp__img"
              size="xs"
              [src]="image(printing)"
              [alt]="''"
              [game]="game()"
            />
            <span class="pp__text">
              <span class="pp__title">
                <span class="mono">{{ code(printing) }}</span>
                @if (printing.rarity) {
                  <span class="pp__rarity">{{ printing.rarity }}</span>
                }
              </span>
              <span class="pp__meta">{{ details(printing) }}</span>
            </span>
            <span class="pp__side">
              @if (price(printing); as price) {
                <span
                  class="pp__price"
                  [matTooltip]="priceDetail(printing)"
                  [attr.aria-label]="priceLabel(printing) + ' ' + price"
                  >{{ price }}</span
                >
              }
              @if (holderCounts(); as counts) {
                <span class="pp__holders">{{ holdersLabel(counts[printing.id ?? ''] ?? 0) }}</span>
              }
            </span>
          </label>
        } @empty {
          <p class="pp__empty" role="status">
            No printing matches these filters.
            <button matButton type="button" (click)="clearFilters()">Clear filters</button>
          </p>
        }
      </div>
    </fieldset>
  `,
  styles: `
    :host {
      display: block;
    }
    .pp {
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .pp__legend {
      padding: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
    }
    .pp__hint {
      margin: var(--spacing-1) 0 var(--spacing-3);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .pp__filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
      margin-bottom: var(--spacing-3);
    }
    .pp__filter {
      flex: 1 1 150px;
      min-width: 0;
      max-width: 220px;
    }
    /* Rarities and set names are long ("Quarter Century Secret Rare"): room for them in full. */
    .pp__filter--wide {
      flex: 2 1 250px;
      max-width: 320px;
    }
    .pp__list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      max-height: var(--printing-picker-max-height, 360px);
      overflow-y: auto;
      padding: 2px;
    }
    .pp__option {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-2) var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      cursor: pointer;
    }
    .pp__option:hover {
      background: var(--color-surface-variant);
    }
    .pp__option:focus-within {
      outline: 2px solid var(--color-primary);
      outline-offset: 1px;
    }
    .pp__option--checked {
      border-color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
    }
    .pp__radio {
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      margin: 0;
      accent-color: var(--color-primary);
    }
    .pp__img {
      flex: 0 0 36px;
      width: 36px;
    }
    .pp__any-icon {
      display: inline-flex;
      flex: 0 0 36px;
      align-items: center;
      justify-content: center;
      height: 50px;
      border-radius: var(--radius-sm);
      background: var(--color-surface-variant);
      color: var(--color-primary);
    }
    .pp__text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .pp__title {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--spacing-2);
      font-weight: var(--font-weight-semibold);
    }
    .pp__rarity {
      color: var(--color-primary);
      font-size: var(--font-size-sm);
    }
    .pp__meta {
      overflow: hidden;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      text-overflow: ellipsis;
    }
    .pp__side {
      display: flex;
      flex: 0 0 auto;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      font-size: var(--font-size-sm);
    }
    .pp__price {
      font-weight: var(--font-weight-semibold);
      text-decoration: underline dotted;
      cursor: help;
    }
    .pp__holders {
      color: var(--color-text-muted);
    }
    .pp__empty {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrintingPickerComponent {
  /** Every printing of the card (the API's order). */
  readonly printings = input<readonly PrintingSummary[]>([]);
  /** The current selection (normalised against the printings). */
  readonly value = input<PrintingSelection | null>(null);
  /** Game slug (placeholder art). */
  readonly game = input<string | null | undefined>('');
  readonly legend = input('Which copy');
  /** Collectors in the region per printing id (stage S3 card page); `null` hides the counts. */
  readonly holderCounts = input<Readonly<Record<string, number>> | null>(null);

  readonly valueChange = output<PrintingSelection>();

  protected readonly groupName = `printing-picker-${nextId++}`;
  protected readonly hintId = `${this.groupName}-hint`;

  protected readonly selection = linkedSignal(() =>
    normaliseSelection(this.value(), this.printings()),
  );
  /**
   * The list filters: reset for another card; a rarity the parent selects shows as the rarity
   * filter; a printing selection keeps the filters the collector set.
   */
  protected readonly filters = linkedSignal<
    { printings: readonly PrintingSummary[]; selection: PrintingSelection },
    PrintingFilters
  >({
    source: () => ({ printings: this.printings(), selection: this.selection() }),
    computation: (source, previous) => {
      const base =
        previous && previous.source.printings === source.printings ? previous.value : NO_FILTERS;
      return source.selection.printingId
        ? base
        : { ...base, rarity: source.selection.rarity ?? '' };
    },
  });

  protected readonly facets = computed(() => {
    const printings = this.printings();
    const all: { key: PrintingFacet; label: string; all: string }[] = [
      { key: 'rarity', label: 'Rarity', all: 'Any rarity' },
      { key: 'set', label: 'Set', all: 'Every set' },
      { key: 'edition', label: 'Edition', all: 'Any edition' },
      { key: 'language', label: 'Language', all: 'Any language' },
    ];
    return all
      .map((facet) => ({ ...facet, options: facetOptions(printings, facet.key) }))
      .filter((facet) => facet.options.length > 1);
  });
  protected readonly filtered = computed(() => {
    const filters = this.filters();
    return !!(filters.rarity || filters.set || filters.edition || filters.language);
  });
  protected readonly visible = computed(() =>
    visiblePrintings(
      this.printings(),
      this.filters(),
      this.selection().printingId,
      this.holderCounts(),
    ),
  );
  protected readonly anyDescription = computed(() => {
    const rarity = this.selection().rarity;
    return rarity ? `Any printing in ${rarity}` : 'Every printing of the card';
  });
  protected readonly hint = computed(() => {
    const selection = this.selection();
    if (selection.printingId) {
      const printing = this.printings().find((candidate) => candidate.id === selection.printingId);
      return printing ? `Only ${this.optionLabel(printing)}.` : 'One printing.';
    }
    const filters = this.filters();
    if (filters.set || filters.edition || filters.language) {
      // Only the rarity is part of an "any printing" choice: say so while other filters are set.
      return selection.rarity
        ? `Any printing in ${selection.rarity}. The set, edition and language filters only narrow the list: choose a printing below for one copy only.`
        : 'Any printing of the card. The set, edition and language filters only narrow the list: choose a rarity or one printing below.';
    }
    return selection.rarity
      ? `Any printing in ${selection.rarity}. Choose a printing below for one copy only.`
      : 'Any printing of the card. Filter by rarity or choose one printing below.';
  });

  constructor() {
    // A value the parent passes that differs from the normalised one is reported once (an
    // unknown printing or rarity becomes "any printing").
    effect(() => {
      const raw = this.value();
      const normalised = this.selection();
      if (raw && !sameSelection(raw, normalised) && this.printings().length) {
        untracked(() => this.valueChange.emit(normalised));
      }
    });
  }

  protected chooseAny(): void {
    this.update({ printingId: null, rarity: this.filters().rarity || null });
  }

  protected choosePrinting(printing: PrintingSummary): void {
    if (printing.id) {
      this.update({ printingId: printing.id, rarity: null });
    }
  }

  protected setFilter(facet: PrintingFacet, value: string): void {
    this.filters.update((filters) => ({ ...filters, [facet]: value ?? '' }));
    if (facet === 'rarity') {
      this.update(selectionForRarity(this.selection(), value ?? '', this.printings()));
    }
  }

  protected clearFilters(): void {
    this.filters.set(NO_FILTERS);
    if (!this.selection().printingId && this.selection().rarity) {
      this.update({ printingId: null, rarity: null });
    }
  }

  protected image(printing: PrintingSummary): string | null {
    return printingImageUrl(printing);
  }

  protected code(printing: PrintingSummary): string {
    return printingCode(printing) || 'No code';
  }

  protected details(printing: PrintingSummary): string {
    return [
      printing.setName,
      printing.edition ? editionLabel(printing.edition) : null,
      printing.language ? languageLabel(printing.language) : null,
      printing.finish ? finishLabel(printing.finish) : null,
    ]
      .filter((part) => part && part !== '—')
      .join(' · ');
  }

  protected price(printing: PrintingSummary): string | null {
    return formatMarketPrice(printing.marketPrice);
  }

  protected priceLabel(printing: PrintingSummary): string {
    return marketPriceInfo(printing.marketPrice)?.label ?? 'Market price';
  }

  protected priceDetail(printing: PrintingSummary): string {
    const info = marketPriceInfo(printing.marketPrice);
    return info ? `${info.label}: ${info.detail}` : '';
  }

  protected holdersLabel(count: number): string {
    return count === 1 ? '1 collector' : `${count} collectors`;
  }

  /** "AZR-EN001, Ultra Rare, Azure Dawn, 1st Edition, English, Normal". */
  protected optionLabel(printing: PrintingSummary): string {
    return [this.code(printing), printing.rarity, this.details(printing).replace(/ · /g, ', ')]
      .filter(Boolean)
      .join(', ');
  }

  private update(next: PrintingSelection): void {
    if (sameSelection(next, this.selection())) {
      return;
    }
    this.selection.set(next);
    this.valueChange.emit(next);
  }
}
