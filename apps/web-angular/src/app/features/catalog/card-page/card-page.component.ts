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
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { CardDetail, CatalogService, PrintingSummary, WishlistService } from '@orenji/api-client';
import type { WishlistItemResponse } from '@orenji/api-client';
import { Subscription, filter, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { GameContext } from '../../../core/game/game-context.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { Popovers } from '../../../core/layout/popover/popover.service';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { RegionContext } from '../../../core/region/region-context.service';
import { APP_NAME } from '../../../core/routing/orenji-title.strategy';
import { CardDataAttributionComponent } from '../../../shared/catalog/card-data-attribution/card-data-attribution.component';
import {
  ANY_PRINTING_PARAM,
  PrintingSelection,
  normaliseSelection,
} from '../../../shared/catalog/printing-picker/printing-selection';
import { tcgplayerSearchUrl } from '../../../shared/catalog/tcgplayer';
import { ViewerPlaceService } from '../../../shared/discovery/viewer-place.service';
import { WhoHasComponent } from '../../../shared/discovery/who-has/who-has.component';
import { gameInfo } from '../../../shared/domain/games';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { REGION_CODE, RegionsStore } from '../../../shared/regions/regions.store';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { WishlistActions } from '../../../shared/wishlist/wishlist-actions.service';
import { CardAddHostComponent } from './card-add-host.component';
import { PRINTING_POPOVER_DATA, printingRowLabel } from './printing-popover.component';

type PageState = 'loading' | 'ready' | 'not-found' | 'error';

/** "First printed in Maximum Crisis" and "MACR-EN036 · 2017" (the printing under the name). */
export function printingCaption(
  selected: PrintingSummary | null,
  printings: readonly PrintingSummary[],
): { lead: string; setName: string; setId: string | null; line: string } | null {
  const oldest = [...printings]
    .filter((printing) => !!printing.setReleaseDate)
    .sort((a, b) => (a.setReleaseDate ?? '').localeCompare(b.setReleaseDate ?? ''))[0];
  const printing = selected ?? oldest ?? printings[0] ?? null;
  if (!printing) {
    return null;
  }
  const year = printing.setReleaseDate?.slice(0, 4);
  return {
    lead: selected ? '' : 'First printed in ',
    setName: printing.setName ?? '',
    setId: printing.setId ?? null,
    line: [printingCode(printing), year].filter(Boolean).join(' · '),
  };
}

/**
 * Who has this card (`/cards/:id?printing&region&rarity`; spec 7, board W7; web stage WD): a
 * container of 1200, the card on the left (sticky: its art at 160 wide, the game, the name, the
 * printing, "Check TCGplayer price ↗" as a plain link, the wishlist toggle, "I have this card"
 * and the card data credit) and who has it in the browsed region on the right ("Any printing ▾",
 * the shared holders list). No market prices, no card text (decision 10). Opening a card of
 * another game makes that game the browsed one (spec 4.2).
 */
@Component({
  selector: 'app-card-page',
  imports: [
    RouterLink,
    CardAddHostComponent,
    CardDataAttributionComponent,
    CardImageComponent,
    ShellIconComponent,
    WhoHasComponent,
  ],
  templateUrl: './card-page.component.html',
  styleUrl: './card-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardPageComponent {
  private readonly catalog = inject(CatalogService);
  private readonly wishlistApi = inject(WishlistService);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly popovers = inject(Popovers);
  private readonly toasts = inject(ToastService);
  private readonly gameContext = inject(GameContext);
  protected readonly auth = inject(AuthService);
  protected readonly regionContext = inject(RegionContext);
  protected readonly regions = inject(RegionsStore);
  protected readonly wishes = inject(WishlistActions);
  protected readonly viewer = inject(ViewerPlaceService);

  /** Route parameter and query parameters (bound by the router). */
  readonly id = input.required<string>();
  readonly printing = input<string | undefined>();
  readonly rarity = input<string | undefined>();
  readonly region = input<string | undefined>();

  protected readonly card = signal<CardDetail | null>(null);
  protected readonly state = signal<PageState>('loading');
  protected readonly error = signal<ApiError | null>(null);
  protected readonly wish = signal<WishlistItemResponse | null>(null);
  protected readonly wishBusy = signal(false);
  /** The Add drawer is open (its chunk loads with the first open, `@defer`). */
  protected readonly adding = signal(false);
  private addOpener: HTMLElement | null = null;

  protected readonly printings = computed<PrintingSummary[]>(() => this.card()?.printings ?? []);
  protected readonly selection = computed<PrintingSelection>(() =>
    normaliseSelection(
      {
        printingId:
          this.printing() && this.printing() !== ANY_PRINTING_PARAM
            ? (this.printing() ?? null)
            : null,
        rarity: this.rarity() ?? null,
      },
      this.printings(),
    ),
  );
  protected readonly selected = computed<PrintingSummary | null>(
    () => this.printings().find((printing) => printing.id === this.selection().printingId) ?? null,
  );
  protected readonly pillLabel = computed(() => {
    const selected = this.selected();
    if (selected) {
      return printingCode(selected) || selected.setName || 'This printing';
    }
    const rarity = this.selection().rarity;
    return rarity ? `Any ${rarity}` : 'Any printing';
  });
  protected readonly caption = computed(() => printingCaption(this.selected(), this.printings()));
  protected readonly art = computed(
    () => printingImageUrl(this.selected()) ?? this.card()?.primaryImageUrl ?? null,
  );
  protected readonly gameLabel = computed(() => gameInfo(this.card()?.game ?? '').label);
  protected readonly regionName = computed(() =>
    this.regions.regionName(this.regionContext.current()),
  );
  protected readonly lead = computed(() => {
    const selected = this.selected();
    const which = selected
      ? `${printingCode(selected)} only.`
      : this.selection().rarity
        ? `Every ${this.selection().rarity} printing.`
        : 'Every printing.';
    const place = this.viewer.place();
    if (!place.subdivisionCode) {
      return `${which} By state or province.`;
    }
    const country = this.regions.country(place.countryCode)?.name;
    return `${which} Your province first, then the rest of ${country ?? 'your country'}, then the region.`;
  });
  protected readonly tcgplayer = computed(() => {
    const card = this.card();
    return card ? tcgplayerSearchUrl(card.game, card.name ?? '') : '';
  });
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });

  private subscription: Subscription | null = null;
  private appliedRegion: string | null = null;

  constructor() {
    void this.regions.load();
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    // A shared link's region selects it once (spec 4.11 `?region=`).
    effect(() => {
      const requested = this.region();
      untracked(() => {
        if (requested && requested !== this.appliedRegion && REGION_CODE.test(requested)) {
          this.appliedRegion = requested;
          this.regionContext.select(requested);
        }
      });
    });
    // The collector's wish of this card (the toggle's state).
    effect(() => {
      const id = this.id();
      const signedIn = this.auth.isAuthenticated();
      untracked(() => void this.loadWish(id, signedIn));
    });
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

  private load(id: string): void {
    this.subscription?.unsubscribe();
    if (this.card()?.id !== id) {
      this.card.set(null);
    }
    this.state.set('loading');
    this.error.set(null);
    this.subscription = this.catalog
      .getCard({ id }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (card) => {
          this.card.set(card);
          this.state.set('ready');
          this.applyTitle();
          // Opening a card of another game makes it the browsed game (spec 4.2).
          if (card.game && this.gameContext.canBrowse(card.game)) {
            this.gameContext.select(card.game);
          }
        },
        error: (error: unknown) => {
          const apiError = toApiError(error);
          this.card.set(null);
          this.error.set(apiError);
          this.state.set(
            apiError.status === 404 || apiError.errorCode === 'VALIDATION_FAILED'
              ? 'not-found'
              : 'error',
          );
        },
      });
  }

  private async loadWish(cardId: string, signedIn: boolean): Promise<void> {
    if (!signedIn) {
      this.wish.set(null);
      return;
    }
    try {
      const items = await firstValueFrom(
        this.wishlistApi.listWishlist('body', false, { context: silentErrors() }),
      );
      if (cardId === this.id()) {
        this.wish.set(items.find((item) => item.card?.id === cardId) ?? null);
      }
    } catch {
      this.wish.set(null);
    }
  }

  /** "Any printing ▾": the printing listbox (a popover of 400). */
  protected openPrintings(event: Event): void {
    const anchor = event.currentTarget as HTMLElement;
    void import('./printing-popover.component').then(({ PrintingPopoverComponent }) =>
      this.popovers.open(anchor, PrintingPopoverComponent, {
        width: 400,
        alignEnd: true,
        providers: [
          {
            provide: PRINTING_POPOVER_DATA,
            useValue: {
              printings: this.printings(),
              selection: this.selection(),
              pick: (selection: PrintingSelection) => this.pick(selection),
            },
          },
        ],
      }),
    );
  }

  private pick(selection: PrintingSelection): void {
    void this.router.navigate([], {
      queryParams: {
        printing: selection.printingId ?? null,
        rarity: selection.printingId ? null : selection.rarity,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected printingLabel(printing: PrintingSummary): string {
    return printingRowLabel(printing);
  }

  /**
   * The wishlist toggle (spec 7.2): off, it adds an "Any printing" wish at once; on ("On your
   * wishlist"), a click opens Edit wish. A guest signs in first.
   */
  protected async toggleWish(): Promise<void> {
    const card = this.card();
    if (!card?.id) {
      return;
    }
    if (!this.auth.isAuthenticated()) {
      this.signIn();
      return;
    }
    const wish = this.wish();
    if (wish) {
      const updated = await this.wishes.edit(wish);
      if (updated) {
        this.wish.set(updated);
      } else {
        // Removed from the dialog, or left as it was: read it again.
        await this.loadWish(card.id, true);
      }
      return;
    }
    this.wishBusy.set(true);
    try {
      const item = await firstValueFrom(
        this.wishlistApi.createWishlistItem({ createWishlistItemRequest: { cardId: card.id } }),
      );
      this.wish.set(item);
      const ref = this.toasts.show({
        title: 'On your wishlist',
        sub: `We'll tell you when someone in ${this.regionName()} lists it.`,
        action: 'View',
      });
      ref.onAction().subscribe(
        () =>
          void this.router.navigate(['/search'], {
            queryParams: { tab: 'wishlist', wish: item.id },
          }),
      );
    } catch {
      // The error interceptors explain it (a limit, a refusal); the toggle stays off.
    } finally {
      this.wishBusy.set(false);
    }
  }

  /** "I have this card": the Add drawer over the page (owner check, decision 17). */
  protected iHaveIt(event: Event): void {
    if (!this.auth.isAuthenticated()) {
      this.signIn();
      return;
    }
    this.addOpener = event.currentTarget as HTMLElement;
    this.adding.set(true);
  }

  protected closeAdd(): void {
    this.adding.set(false);
    const opener = this.addOpener;
    setTimeout(() => opener?.focus());
  }

  private signIn(): void {
    void this.router.navigate(['/auth/sign-in'], { queryParams: { returnUrl: this.router.url } });
  }

  private applyTitle(): void {
    const name = this.card()?.name;
    if (name) {
      this.title.setTitle(`${name} · ${APP_NAME}`);
    }
  }
}
