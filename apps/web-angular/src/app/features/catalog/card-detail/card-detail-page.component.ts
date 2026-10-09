import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { CardDetail, CatalogService, PrintingSummary } from '@orenji/api-client';
import { Subscription, filter } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { APP_NAME } from '../../../core/routing/orenji-title.strategy';
import { CardDataAttributionComponent } from '../../../shared/catalog/card-data-attribution/card-data-attribution.component';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import {
  editionLabel,
  finishLabel,
  formatMarketPrice,
  languageLabel,
  marketPriceInfo,
} from '../../../shared/catalog/catalog-labels';
import { GamesStore } from '../../../shared/catalog/games.store';
import {
  PrintingSelection,
  normaliseSelection,
} from '../../../shared/catalog/printing-picker/printing-selection';
import { printingCode } from '../../../shared/inventory/inventory-labels';
import { gameInfo } from '../../../shared/domain/games';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { GameChipComponent } from '../../../shared/ui/game-chip/game-chip.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { WishlistActions } from '../../../shared/wishlist/wishlist-actions.service';
import { PrintingsTableComponent } from '../shared/printings-table.component';
import { CardMetadataComponent } from './card-metadata.component';

/**
 * `/cards/:id`: hero picture, game-specific attributes from the game's schema, which copy the URL
 * names, every printing, "Who has this in my region" and "Add to wishlist". `?printing=` selects a
 * printing (its details and market price, labelled with the price's source); `?rarity=` (the link
 * of a wishlist alert for "any printing in a rarity") shows "Any printing in <rarity>" with the
 * printings of that rarity highlighted and picks none of them; with neither, the first printing
 * is shown (stage S3 replaces this with the shared printing picker, "Any printing" by default).
 * "Add to wishlist" opens the wishlist dialog on that same selection.
 */
@Component({
  selector: 'app-card-detail-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    CardDataAttributionComponent,
    CardImageComponent,
    CardMetadataComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    GameChipComponent,
    PrintingsTableComponent,
    SkeletonComponent,
  ],
  templateUrl: './card-detail-page.component.html',
  styleUrl: './card-detail-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardDetailPageComponent {
  private readonly api = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly games = inject(GamesStore);
  protected readonly wishlist = inject(WishlistActions);

  /** Route parameter and the `?printing=` / `?rarity=` query parameters (bound by the router). */
  readonly id = input.required<string>();
  readonly printing = input<string | undefined>();
  readonly rarity = input<string | undefined>();

  protected readonly card = signal<CardDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  /** Unknown card, hidden game, or an id that is not a UUID (400 from the API). */
  protected readonly notFound = computed(() => {
    const error = this.error();
    return !!error && (error.status === 404 || error.errorCode === 'VALIDATION_FAILED');
  });
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });

  protected readonly printings = computed<PrintingSummary[]>(() => this.card()?.printings ?? []);
  /**
   * Which copy the URL names: a printing of this card, else a rarity of its printings (an unknown
   * printing or rarity is ignored).
   */
  protected readonly selection = computed<PrintingSelection>(() =>
    normaliseSelection(
      { printingId: this.printing() ?? null, rarity: this.rarity() ?? null },
      this.printings(),
    ),
  );
  /** The printings of "any printing in <rarity>" (empty otherwise). */
  protected readonly rarityPrintings = computed<PrintingSummary[]>(() => {
    const rarity = this.selection().rarity;
    return rarity ? this.printings().filter((printing) => printing.rarity === rarity) : [];
  });
  /** The printing shown in detail: never one silently picked for "any printing in <rarity>". */
  protected readonly selected = computed<PrintingSummary | null>(() => {
    const printings = this.printings();
    const selection = this.selection();
    if (selection.printingId) {
      return printings.find((candidate) => candidate.id === selection.printingId) ?? null;
    }
    return selection.rarity ? null : (printings[0] ?? null);
  });
  /** "Add to inventory" needs one printing: the shown one, or the only one of the rarity. */
  protected readonly inventoryPrintingId = computed(() => {
    const rarityPrintings = this.rarityPrintings();
    return (
      this.selected()?.id ?? (rarityPrintings.length === 1 ? (rarityPrintings[0].id ?? null) : null)
    );
  });
  protected readonly schema = computed(() => this.games.schema(this.card()?.game));
  protected readonly gameLabel = computed(() => gameInfo(this.card()?.game ?? '').label);
  protected readonly typeLine = computed(() => {
    const card = this.card();
    return [card?.cardType, card?.subtype].filter(Boolean).join(' · ');
  });
  protected readonly heroImage = computed(() => {
    const front = this.selected()?.images?.find((image) => image.kind === 'FRONT')?.url;
    return front ?? this.card()?.primaryImageUrl ?? null;
  });
  protected readonly heroAlt = computed(() => {
    const card = this.card();
    const code = this.selected()?.printingCode;
    return card ? `${card.name}${code ? `, printing ${code}` : ''}` : '';
  });
  protected readonly selectedPrice = computed(() =>
    formatMarketPrice(this.selected()?.marketPrice),
  );
  /** What the shown market price is ("TCG market price") and its source and date (tooltip). */
  protected readonly selectedPriceInfo = computed(() =>
    marketPriceInfo(this.selected()?.marketPrice),
  );
  protected readonly edition = editionLabel;
  protected readonly finish = finishLabel;
  protected readonly language = languageLabel;

  private subscription: Subscription | null = null;

  constructor() {
    void this.games.load();
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    // The title strategy resets the document title on every navigation (including `?printing=`
    // changes): re-apply the card name afterwards.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => setTimeout(() => this.applyTitle()));
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected reload(): void {
    this.load(this.id());
  }

  /** Opens the wishlist dialog for this card (the URL's printing or rarity, else any printing). */
  protected addToWishlist(cardId: string): void {
    const selection = this.selection();
    void this.wishlist.add({
      cardId,
      printingId: selection.printingId,
      rarity: selection.printingId ? null : selection.rarity,
    });
  }

  /** One printing replaces "any printing in <rarity>". */
  protected selectPrinting(printingId: string): void {
    void this.router.navigate([], {
      queryParams: { printing: printingId, rarity: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** "AZR-EN001 · 1st Edition · English" (a printing of "any printing in <rarity>"). */
  protected rarityPrintingLabel(printing: PrintingSummary): string {
    return [
      printingCode(printing),
      printing.edition ? editionLabel(printing.edition) : null,
      printing.language ? languageLabel(printing.language) : null,
      printing.finish && printing.finish !== 'NORMAL' ? finishLabel(printing.finish) : null,
    ]
      .filter((part) => part && part !== '—')
      .join(' · ');
  }

  private load(id: string): void {
    this.subscription?.unsubscribe();
    if (this.card()?.id !== id) {
      this.card.set(null);
    }
    this.loading.set(true);
    this.error.set(null);
    this.subscription = this.api
      .getCard({ id }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (card) => {
          this.card.set(card);
          this.loading.set(false);
          this.applyTitle();
        },
        error: (error: unknown) => {
          this.card.set(null);
          this.error.set(toApiError(error));
          this.loading.set(false);
        },
      });
  }

  private applyTitle(): void {
    const name = this.card()?.name;
    if (name) {
      this.title.setTitle(`${name} · ${APP_NAME}`);
    }
  }
}
