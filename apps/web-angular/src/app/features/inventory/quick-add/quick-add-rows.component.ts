import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import {
  CardSuggestion,
  CatalogService,
  GameResponse,
  InventoryItemResponse,
} from '@orenji/api-client';
import { Subject, catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';
import { ApiError } from '../../../core/http/api-error';
import { friendlyError } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { isLimitReached, limitReachedInfo } from '../../../core/limits/limit-reached';
import { SUGGEST_DEBOUNCE_MS } from '../../../shared/catalog/catalog-constants';
import { gameInfo } from '../../../shared/domain/games';
import { limitLabel } from '../../../shared/limits/limit-labels';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../../shared/ui/segmented/segmented.component';
import { binderGame } from '../data/binder-games';
import {
  CardVisibility,
  QUANTITY_MAX,
  newCardForm,
  parseQuantity,
  toCreateBody,
} from '../data/card-form';
import { InventoryStore } from '../data/inventory.store';
import { UNDO_WINDOW_MS, binderGameError } from '../data/inventory-actions.service';
import {
  PRICE_COPY,
  PriceMode,
  checkPrice,
  lastPriceMode,
  priceInputOf,
  rememberPriceMode,
} from '../data/item-price';

/** A printing code as printed on a card: letters and digits, a dash, then the number. */
export const CODE_PATTERN = /^[A-Za-z0-9]{2,6}-[A-Za-z]{0,3}\d{1,4}[A-Za-z]?$/;

/** Whether the text reads as a printing code ("MACR-EN036") rather than a name. */
export function looksLikeCode(text: string): boolean {
  return CODE_PATTERN.test(text.trim());
}

/** The printing a code names among the suggestions (same code, any case), if any. */
export function printingForCode(
  suggestions: readonly CardSuggestion[],
  code: string,
): CardSuggestion | null {
  const wanted = code.trim().toUpperCase();
  return (
    suggestions.find(
      (suggestion) =>
        suggestion.kind === 'PRINTING' && (suggestion.printingCode ?? '').toUpperCase() === wanted,
    ) ?? null
  );
}

/** The 429's words (spec 9.10): the limit, the usage and the reset, the same for everyone. */
export function quickAddLimitMessage(error: ApiError, now = Date.now()): string {
  const info = limitReachedInfo(error);
  const what = info.limitKey ? limitLabel(info.limitKey) : 'A usage limit';
  const usage =
    info.limit !== null
      ? ` You used ${info.used ?? info.limit} of ${info.limit}.`
      : '';
  let reset = '';
  if (info.resetsAt) {
    const minutes = Math.max(1, Math.ceil((Date.parse(info.resetsAt) - now) / 60_000));
    reset =
      minutes < 90
        ? ` It resets in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
        : ` It resets at ${new Date(info.resetsAt).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}.`;
  }
  return `${what}: limit reached.${usage}${reset} Every collector has the same limits.`;
}

interface Committed {
  item: InventoryItemResponse;
  until: number;
  undone: boolean;
}

const PRICE_MODES: readonly SegmentOption<PriceMode>[] = [
  { value: 'usd', label: '$', spoken: PRICE_COPY.modes.usd.spoken },
  { value: 'pct', label: '% TCG', spoken: PRICE_COPY.modes.pct.spoken },
];

const VISIBILITIES: readonly SegmentOption<CardVisibility>[] = [
  { value: 'PRIVATE', label: 'Private' },
  { value: 'PUBLIC', label: 'Public' },
];

/**
 * Quick add rows (spec 9.10, board W14; Shift+N): a keyboard-first entry row pinned at the top of
 * the table. A code ("MACR-EN036") finds its printing through `/cards/suggest`; a name opens the
 * printing list under the field (↑↓, Enter). Tab moves through the fields, Enter adds the row
 * (one `POST /inventory/items`), Esc leaves. Each added row shows below with "Undo" for 10
 * minutes; copies go back to 1, the price mode, who can see it and the binder stay. Errors stay
 * inline, a 429 too (it names the limit, the usage and the reset, never anything to buy).
 */
@Component({
  selector: 'app-quick-add-rows',
  imports: [MatIconModule, MatMenuModule, CardImageComponent, GameMonogramComponent, SegmentedComponent],
  templateUrl: './quick-add-rows.component.html',
  styleUrl: './quick-add-rows.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickAddRowsComponent {
  private readonly catalog = inject(CatalogService);
  private readonly store = inject(InventoryStore);

  readonly games = input<readonly GameResponse[]>([]);
  /** The binder chosen in the pane (new cards of its game go in it). */
  readonly binderId = input<string | null>(null);
  readonly closed = output<void>();

  private readonly codeField = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  protected readonly game = signal('yugioh');
  protected readonly text = signal('');
  protected readonly suggestions = signal<CardSuggestion[]>([]);
  protected readonly searching = signal(false);
  protected readonly active = signal(0);
  protected readonly listOpen = signal(false);
  protected readonly chosen = signal<CardSuggestion | null>(null);
  protected readonly quantity = signal('1');
  protected readonly priceMode = signal<PriceMode>(lastPriceMode());
  protected readonly price = signal('');
  protected readonly visibility = signal<CardVisibility>('PRIVATE');
  protected readonly binder = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly committed = signal<Committed[]>([]);
  private readonly typed = new Subject<string>();

  protected readonly priceModes = PRICE_MODES;
  protected readonly visibilities = VISIBILITIES;
  protected readonly gameLabel = computed(() => gameInfo(this.game()).label);
  protected readonly gameOptions = computed(() =>
    this.games().filter((game) => game.hasCards !== false && game.slug),
  );
  protected readonly list = computed(() => {
    const items = this.suggestions();
    const printings = items.filter((item) => item.kind === 'PRINTING');
    return printings.length ? printings : items;
  });
  protected readonly gameBinders = computed(() =>
    (this.store.binders() ?? []).filter((binder) => {
      const game = binderGame(binder);
      return !game || game === this.game();
    }),
  );
  protected readonly binderName = computed(() => {
    const id = this.binder();
    return id ? (this.store.bindersById().get(id)?.name ?? 'Unfiled') : 'Unfiled';
  });

  constructor() {
    this.typed
      .pipe(
        map((value) => value.trim()),
        tap(() => {
          this.chosen.set(null);
          this.error.set(null);
        }),
        debounceTime(SUGGEST_DEBOUNCE_MS),
        switchMap((q) => {
          if (q.length < 2) {
            this.suggestions.set([]);
            this.listOpen.set(false);
            return of(null);
          }
          this.searching.set(true);
          return this.catalog
            .suggestCards({ q, game: this.game(), limit: 10 }, 'body', false, {
              context: silentErrors(),
            })
            .pipe(
              map((items) => ({ q, items: items ?? [] })),
              catchError(() => of({ q, items: null as CardSuggestion[] | null })),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.searching.set(false);
        if (!result) {
          return;
        }
        if (result.items === null) {
          this.error.set('Cards could not load. Check your connection and type again.');
          return;
        }
        this.suggestions.set(result.items);
        this.active.set(0);
        const exact = looksLikeCode(result.q) ? printingForCode(result.items, result.q) : null;
        if (exact) {
          this.chosen.set(exact);
          this.listOpen.set(false);
        } else {
          this.listOpen.set(result.items.length > 0);
        }
      });
    afterNextRender(() => {
      const id = this.binderId();
      const binder = id ? this.store.bindersById().get(id) : null;
      if (binder) {
        this.binder.set(binder.id);
        this.game.set(binderGame(binder) ?? 'yugioh');
      }
      this.focusCode();
    });
  }

  protected image(suggestion: CardSuggestion | null): string | null {
    return suggestion?.imageUrl ?? null;
  }

  protected chooseGame(slug: string): void {
    this.game.set(slug);
    const binder = this.binder() ? this.store.bindersById().get(this.binder()!) : null;
    if (binder && binderGame(binder) && binderGame(binder) !== slug) {
      this.binder.set(null);
    }
    this.typed.next(this.text());
    this.focusCode();
  }

  protected onText(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.text.set(value);
    this.typed.next(value);
  }

  protected onCodeKey(event: KeyboardEvent): void {
    const list = this.list();
    if (this.listOpen() && list.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.active.set((this.active() + 1) % list.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.active.set((this.active() - 1 + list.length) % list.length);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        void this.pick(list[this.active()]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.listOpen.set(false);
        return;
      }
    }
  }

  /** Enter anywhere in the row adds it; Esc leaves the quick add rows. */
  protected onRowKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.getAttribute('aria-haspopup')) {
      return;
    }
    if (event.key === 'Enter' && !event.defaultPrevented) {
      event.preventDefault();
      void this.commit();
    } else if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      this.closed.emit();
    }
  }

  protected async pick(suggestion: CardSuggestion | undefined): Promise<void> {
    if (!suggestion) {
      return;
    }
    if (suggestion.kind === 'PRINTING') {
      this.chosen.set(suggestion);
      this.text.set(suggestion.printingCode ?? suggestion.name ?? '');
      this.listOpen.set(false);
      return;
    }
    // A card: its printings take the list's place.
    this.searching.set(true);
    this.catalog.getCard({ id: suggestion.id! }, 'body', false, { context: silentErrors() }).subscribe({
      next: (card) => {
        this.searching.set(false);
        this.suggestions.set(
          (card.printings ?? []).map((printing) => ({
            kind: 'PRINTING',
            id: card.id,
            printingId: printing.id,
            name: card.name,
            game: card.game,
            printingCode: printing.printingCode ?? undefined,
            setName: printing.setName ?? null,
            rarity: printing.rarity ?? null,
            imageUrl: printing.images?.[0]?.url ?? card.primaryImageUrl,
          })) as CardSuggestion[],
        );
        this.active.set(0);
        this.listOpen.set(true);
      },
      error: () => {
        this.searching.set(false);
        this.error.set('This card could not load. Try again.');
      },
    });
  }

  protected onQuantity(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/[^0-9]/g, '').slice(0, 4);
    input.value = digits;
    this.quantity.set(digits);
  }

  protected step(direction: 1 | -1): void {
    const current = parseQuantity(this.quantity());
    const next = Math.min(QUANTITY_MAX, Math.max(1, (Number.isNaN(current) ? 1 : current) + direction));
    this.quantity.set(String(next));
  }

  protected onPrice(event: Event): void {
    const input = event.target as HTMLInputElement;
    const kept = priceInputOf(this.priceMode(), input.value);
    input.value = kept;
    this.price.set(kept);
  }

  protected switchMode(mode: PriceMode): void {
    this.priceMode.set(mode);
    this.price.set('');
  }

  /** Adds the row (one `POST /inventory/items`). */
  async commit(): Promise<void> {
    if (this.saving()) {
      return;
    }
    const text = this.text().trim();
    let chosen = this.chosen();
    if (!chosen && looksLikeCode(text)) {
      chosen = await this.resolveCode(text);
      if (!chosen) {
        this.error.set(
          `No ${this.gameLabel()} card has that code. Try the code printed on the card, like LAVD-EN008.`,
        );
        this.focusCode();
        return;
      }
    }
    if (!chosen?.printingId) {
      this.error.set(
        text
          ? 'Pick the printing on your card from the list, or type its code.'
          : 'Type a code or a name first.',
      );
      this.listOpen.set(this.list().length > 0);
      this.focusCode();
      return;
    }
    const quantity = parseQuantity(this.quantity());
    if (Number.isNaN(quantity) || quantity < 1 || quantity > QUANTITY_MAX) {
      this.error.set(`Copies: a whole number from 1 to ${QUANTITY_MAX}.`);
      return;
    }
    const price = checkPrice(this.priceMode(), this.price());
    if (price.kind === 'error') {
      this.error.set(price.message);
      return;
    }
    const form = {
      ...newCardForm(this.binder(), this.priceMode(), this.visibility()),
      quantity: String(quantity),
      price: this.price(),
    };
    this.saving.set(true);
    this.error.set(null);
    try {
      const item = await this.store.createItem(toCreateBody(form, chosen.printingId), {
        explainLimit: true,
      });
      rememberPriceMode(this.priceMode());
      this.committed.update((rows) => [
        { item, until: Date.now() + UNDO_WINDOW_MS, undone: false },
        ...rows,
      ]);
      // Copies reset; the price mode, who can see it and the binder stay.
      this.text.set('');
      this.chosen.set(null);
      this.suggestions.set([]);
      this.quantity.set('1');
      this.price.set('');
      this.focusCode();
    } catch (error) {
      const apiError = error as ApiError;
      this.error.set(
        isLimitReached(apiError)
          ? quickAddLimitMessage(apiError)
          : (binderGameError(apiError, this.gameLabel()) ?? friendlyError(apiError).message),
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected canUndo(row: Committed): boolean {
    return !row.undone && row.until > Date.now();
  }

  /** "Undo" of an added row: the card leaves the inventory again. */
  protected async undo(row: Committed): Promise<void> {
    try {
      await this.store.deleteItem(row.item.id);
      this.committed.update((rows) =>
        rows.map((candidate) => (candidate === row ? { ...candidate, undone: true } : candidate)),
      );
    } catch (error) {
      this.error.set(friendlyError(error as ApiError).message);
    }
  }

  protected code(item: InventoryItemResponse): string {
    return item.printing.printingCode ?? item.printing.setCode ?? '';
  }

  private resolveCode(code: string): Promise<CardSuggestion | null> {
    return new Promise((resolve) => {
      this.catalog
        .suggestCards({ q: code, game: this.game(), limit: 10 }, 'body', false, {
          context: silentErrors(),
        })
        .subscribe({
          next: (items) => resolve(printingForCode(items ?? [], code)),
          error: () => resolve(null),
        });
    });
  }

  private focusCode(): void {
    setTimeout(() => this.codeField()?.nativeElement.focus(), 0);
  }
}
