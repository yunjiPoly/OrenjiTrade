import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CardDetail, CardSuggestion, CatalogService, PrintingSummary } from '@orenji/api-client';
import {
  EMPTY,
  Subject,
  Subscription,
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  switchMap,
  tap,
} from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyError, friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { isLimitReached } from '../../../core/limits/limit-reached';
import { RegionContext } from '../../../core/region/region-context.service';
import {
  QUERY_MAX_LENGTH,
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_MIN_CHARS,
} from '../../../shared/catalog/catalog-constants';
import { uniqueSuggestions } from '../../../shared/catalog/card-suggestions';
import { gameInfo } from '../../../shared/domain/games';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { RegionsStore } from '../../../shared/regions/regions.store';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import { binderGame } from '../data/binder-games';
import {
  CardFormErrors,
  CardFormValue,
  hasErrors,
  newCardForm,
  serverCardErrors,
  toCreateBody,
  validateCardForm,
} from '../data/card-form';
import { binderGameError } from '../data/inventory-actions.service';
import { InventoryStore } from '../data/inventory.store';
import { lastPriceMode, rememberPriceMode } from '../data/item-price';
import { printingVariant, suggestionVariant } from '../data/printing-variant';
import { AddManyChoice, AddManyComponent } from './add-many.component';
import { CardFieldsComponent } from './card-fields.component';
import { DrawerFrameComponent } from './drawer-frame.component';

type Step = 'search' | 'printing' | 'details';

interface Kept {
  binderId: string | null;
  visibility: 'PRIVATE' | 'PUBLIC';
}

/** The rarity chips' "All". */
const ALL = '';

/**
 * The Add cards drawer (spec 9.9, board W13; `n` or "Add cards"): 1. Card: the search by name or
 * code (cards with their printings count, exact printings), or "Add many at once" with an empty
 * field; 2. Printing: the card's printings with a filter and rarity chips; 3. Details: the phone's
 * card fields, [Add to inventory] and "Keep these for the next card". After each add the toast
 * "Saved · {name}" [View], the new row at the top of the list, and back to step 1 with the field
 * focused; "Done" closes. No camera scan on the web.
 */
@Component({
  selector: 'app-add-cards-drawer',
  imports: [
    MatButtonModule,
    MatIconModule,
    AddManyComponent,
    CardFieldsComponent,
    CardImageComponent,
    DrawerFrameComponent,
    GameMonogramComponent,
  ],
  templateUrl: './add-cards-drawer.component.html',
  styleUrl: './add-cards-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddCardsDrawerComponent {
  private readonly catalog = inject(CatalogService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly store = inject(InventoryStore);
  private readonly toasts = inject(ToastService);
  private readonly region = inject(RegionContext);
  private readonly regions = inject(RegionsStore);

  /** The binder chosen in the pane: new cards of its game go in it. */
  readonly binderId = input<string | null>(null);
  readonly startCard = input<string | null>(null);
  readonly startPrinting = input<string | null>(null);
  readonly modal = input(false, { transform: booleanAttribute });
  readonly closed = output<void>();
  readonly many = output<AddManyChoice>();
  readonly view = output<string>();

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  protected readonly step = signal<Step>('search');
  protected readonly query = signal('');
  protected readonly status = signal<'idle' | 'loading' | 'results' | 'empty' | 'error'>('idle');
  protected readonly suggestions = signal<CardSuggestion[]>([]);
  protected readonly active = signal(0);
  protected readonly card = signal<CardDetail | null>(null);
  protected readonly cardError = signal<string | null>(null);
  protected readonly printing = signal<PrintingSummary | null>(null);
  protected readonly filter = signal('');
  protected readonly rarity = signal(ALL);
  protected readonly form = signal<CardFormValue>(newCardForm(null, lastPriceMode()));
  protected readonly errors = signal<CardFormErrors>({});
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly keep = signal(true);
  protected readonly added = signal(0);
  private kept: Kept | null = null;
  private readonly typed = new Subject<string>();
  private cardSubscription: Subscription | null = null;

  protected readonly cards = computed(() =>
    this.suggestions().filter((suggestion) => suggestion.kind !== 'PRINTING'),
  );
  protected readonly printings = computed(() =>
    this.suggestions().filter((suggestion) => suggestion.kind === 'PRINTING'),
  );
  /** Every row the arrow keys move through: cards first, then exact printings. */
  protected readonly options = computed(() => [...this.cards(), ...this.printings()]);
  protected readonly ownedCards = computed(
    () => new Set(this.store.items().map((item) => item.card.id)),
  );
  protected readonly cardPrintings = computed(() => this.card()?.printings ?? []);
  protected readonly rarities = computed(() => [
    ...new Set(
      this.cardPrintings()
        .map((p) => p.rarity)
        .filter((r): r is string => !!r),
    ),
  ]);
  protected readonly shownPrintings = computed(() => {
    const text = this.filter().trim().toLowerCase();
    const rarity = this.rarity();
    return this.cardPrintings().filter(
      (p) =>
        (!rarity || p.rarity === rarity) &&
        (!text ||
          printingCode(p).toLowerCase().includes(text) ||
          (p.setName ?? '').toLowerCase().includes(text)),
    );
  });
  protected readonly game = computed(() => this.card()?.game ?? 'yugioh');
  protected readonly regionName = computed(() => {
    const home = this.region.home();
    return home ? this.regions.regionName(home) : null;
  });

  constructor() {
    this.typed
      .pipe(
        map((value) => value.trim().slice(0, QUERY_MAX_LENGTH)),
        tap((value) => {
          if (value.length < SUGGEST_MIN_CHARS) {
            this.suggestions.set([]);
            this.status.set('idle');
          }
        }),
        debounceTime(SUGGEST_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.length < SUGGEST_MIN_CHARS) {
            return EMPTY;
          }
          this.status.set('loading');
          return this.catalog
            .suggestCards({ q, limit: 12 }, 'body', false, { context: silentErrors() })
            .pipe(
              tap((items) => {
                const unique = uniqueSuggestions(items ?? []);
                this.suggestions.set(unique);
                this.active.set(0);
                this.status.set(unique.length ? 'results' : 'empty');
              }),
              catchError(() => {
                this.suggestions.set([]);
                this.status.set('error');
                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
    inject(DestroyRef).onDestroy(() => this.cardSubscription?.unsubscribe());
    afterNextRender(() => {
      const card = this.startCard();
      if (card) {
        this.openCard(card, this.startPrinting());
      } else {
        this.focusField();
      }
    });
  }

  protected gameLabel(slug: string | null | undefined): string {
    return slug ? gameInfo(slug).label : '';
  }

  protected code(printing: PrintingSummary): string {
    return printingCode(printing);
  }

  protected image(printing: PrintingSummary | null): string | null {
    return printingImageUrl(printing);
  }

  /** What tells a printing from its same-code twins (U2), or null. */
  protected variant(printing: PrintingSummary): string | null {
    return printingVariant(printing, this.cardPrintings());
  }

  /** "Secret Rare · 1st Edition": the rarity and what tells the printing from its twins. */
  protected rarityLine(printing: PrintingSummary): string {
    return [printing.rarity, this.variant(printing)].filter(Boolean).join(' · ');
  }

  protected suggestionVariant(suggestion: CardSuggestion): string | null {
    return suggestionVariant(suggestion, this.printings());
  }

  protected year(printing: PrintingSummary): string | null {
    return printing.setReleaseDate ? printing.setReleaseDate.slice(0, 4) : null;
  }

  /** The name with the typed part in orange. */
  protected parts(name: string | undefined): { before: string; match: string; after: string } {
    const text = name ?? '';
    const q = this.query().trim().toLowerCase();
    const at = q ? text.toLowerCase().indexOf(q) : -1;
    return at < 0
      ? { before: text, match: '', after: '' }
      : {
          before: text.slice(0, at),
          match: text.slice(at, at + q.length),
          after: text.slice(at + q.length),
        };
  }

  protected optionId(index: number): string {
    return `add-option-${index}`;
  }

  protected onType(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.typed.next(value);
  }

  protected clear(): void {
    this.query.set('');
    this.typed.next('');
    this.focusField();
  }

  protected onFieldKey(event: KeyboardEvent): void {
    const count = this.options().length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      this.active.set((this.active() + 1) % count);
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      this.active.set((this.active() - 1 + count) % count);
    } else if (event.key === 'Enter' && count) {
      event.preventDefault();
      this.pick(this.options()[this.active()]);
    }
  }

  protected pick(suggestion: CardSuggestion | undefined): void {
    if (!suggestion?.id) {
      return;
    }
    this.openCard(
      suggestion.id,
      suggestion.kind === 'PRINTING' ? (suggestion.printingId ?? null) : null,
    );
  }

  protected choosePrinting(printing: PrintingSummary): void {
    this.printing.set(printing);
    this.toDetails();
  }

  protected back(): void {
    this.error.set(null);
    if (this.step() === 'details' && this.cardPrintings().length > 1) {
      this.step.set('printing');
      this.focusStep();
      return;
    }
    this.step.set('search');
    this.focusField();
  }

  protected change(change: Partial<CardFormValue>): void {
    this.form.update((value) => ({ ...value, ...change }));
    if (Object.keys(this.errors()).length) {
      this.errors.set(validateCardForm(this.form()));
    }
  }

  protected async addToInventory(): Promise<void> {
    const printing = this.printing();
    const card = this.card();
    if (!printing?.id || !card) {
      return;
    }
    const errors = validateCardForm(this.form());
    this.errors.set(errors);
    if (hasErrors(errors)) {
      this.error.set('Check the highlighted fields.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const value = this.form();
      const item = await this.store.createItem(toCreateBody(value, printing.id));
      rememberPriceMode(value.priceMode);
      this.kept = this.keep() ? { binderId: value.binderId, visibility: value.visibility } : null;
      this.added.update((count) => count + 1);
      const ref = this.toasts.show({ title: 'Saved', sub: item.card.name, action: 'View' });
      ref.onAction().subscribe(() => this.view.emit(item.id));
      this.restart();
    } catch (error) {
      const apiError = error as ApiError;
      if (isLimitReached(apiError)) {
        this.error.set('You reached a limit. Every collector has the same limits.');
      } else {
        this.errors.set(serverCardErrors(apiError));
        this.error.set(
          binderGameError(apiError, gameInfo(card.game ?? '').label) ??
            friendlyError(apiError).message,
        );
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected retryCard(): void {
    const card = this.card();
    if (card?.id) {
      this.openCard(card.id, this.printing()?.id ?? null);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && this.step() === 'details') {
      event.preventDefault();
      void this.addToInventory();
    }
  }

  private restart(): void {
    this.step.set('search');
    this.card.set(null);
    this.printing.set(null);
    this.query.set('');
    this.typed.next('');
    this.suggestions.set([]);
    this.status.set('idle');
    this.errors.set({});
    this.focusField();
  }

  private openCard(cardId: string, printingId: string | null): void {
    this.cardSubscription?.unsubscribe();
    this.cardError.set(null);
    this.filter.set('');
    this.rarity.set(ALL);
    if (this.card()?.id !== cardId) {
      this.card.set(null);
    }
    this.step.set('printing');
    this.cardSubscription = this.catalog
      .getCard({ id: cardId }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (card) => {
          this.card.set(card);
          const printings = card.printings ?? [];
          const wanted =
            printings.find((printing) => printing.id === printingId) ??
            (printings.length === 1 ? printings[0] : null);
          if (wanted) {
            this.printing.set(wanted);
            this.toDetails();
          } else {
            this.printing.set(null);
            this.focusStep();
          }
        },
        error: (error: unknown) => this.cardError.set(friendlyMessage(toApiError(error))),
      });
  }

  private toDetails(): void {
    const game = this.game();
    const sameGame = (id: string | null) => {
      const binder = id ? this.store.bindersById().get(id) : null;
      return binder && (binderGame(binder) ?? game) === game ? id : null;
    };
    const kept = this.kept;
    const binderId = sameGame(kept?.binderId ?? this.binderId());
    this.form.set(newCardForm(binderId, lastPriceMode(), kept?.visibility ?? 'PRIVATE'));
    this.errors.set({});
    this.error.set(null);
    this.step.set('details');
    this.focusStep();
  }

  /**
   * A step replaced the focused one (A1, A2): the focus moves to the new step's heading (the card's
   * name), which a screen reader then reads.
   */
  private focusStep(): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[data-step-focus]')?.focus());
  }

  private focusField(): void {
    setTimeout(() => this.field()?.nativeElement.focus(), 0);
  }
}
