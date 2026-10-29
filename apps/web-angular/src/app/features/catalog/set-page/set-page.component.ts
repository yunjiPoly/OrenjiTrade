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
import {
  BindersService,
  CatalogService,
  InventoryService,
  PrintingSummary,
  SetDetail,
} from '@orenji/api-client';
import type { BinderResponse, CreateInventoryItemRequest } from '@orenji/api-client';
import { Subscription, filter, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { GameContext } from '../../../core/game/game-context.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { isLimitReached } from '../../../core/limits/limit-reached';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { APP_NAME } from '../../../core/routing/orenji-title.strategy';
import { CardDataAttributionComponent } from '../../../shared/catalog/card-data-attribution/card-data-attribution.component';
import { gameInfo } from '../../../shared/domain/games';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../../shared/ui/segmented/segmented.component';
import { binderGame } from '../../inventory/data/binder-games';

/** Printings per page of a set (the API's maximum). */
export const SET_PAGE_SIZE = 200;
/** "I have" at most this many copies of one printing in one go (the phone's stepper). */
export const SET_STEPPER_MAX = 99;

type Visibility = 'PRIVATE' | 'PUBLIC';

/** "7 cards", "1 card". */
export function cardsLabel(count: number): string {
  return `${count} ${count === 1 ? 'card' : 'cards'}`;
}

/** The binders "Add from this set" can file into: the collector's binders of the set's game. */
export function sameGameBinders(
  binders: readonly BinderResponse[],
  game: string,
): BinderResponse[] {
  return binders.filter((binder) => {
    const own = binderGame(binder);
    return !own || own === game;
  });
}

/** One create per tile with copies (until a batch create is offered on the web, spec 7.5). */
export function addBodies(
  counts: ReadonlyMap<string, number>,
  visibility: Visibility,
  binderId: string | null,
): CreateInventoryItemRequest[] {
  return [...counts.entries()]
    .filter(([, quantity]) => quantity > 0)
    .map(([printingId, quantity]) => ({
      printingId,
      quantity,
      visibility: visibility as CreateInventoryItemRequest['visibility'],
      availability: 'TRADE_OR_SALE' as CreateInventoryItemRequest['availability'],
      acceptsOffers: false,
      conditionStated: false,
      ...(binderId ? { binderId } : {}),
    }));
}

/**
 * A set page (`/sets/:id`, spec 7.5; web stage WD): the mono code, the set name, "Released Nov 1,
 * 2024 · 101 printings" (the set header may count, spec 17) and [Who has cards of this set]; a
 * grid of its printings (art at most 160 wide) with the code and the rarity, each opening its card
 * page on that printing. "Add from this set" (signed in, web only, owner check, decision 17): a −
 * 0 + "I have" stepper on each tile, a sticky footer with the count, Private or Public, a binder
 * of this game, and [Add n cards], one create per tile, then the toast "n cards added" [View].
 */
@Component({
  selector: 'app-set-page',
  imports: [
    RouterLink,
    CardDataAttributionComponent,
    CardImageComponent,
    SegmentedComponent,
    ShellIconComponent,
  ],
  templateUrl: './set-page.component.html',
  styleUrl: './set-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetPageComponent {
  private readonly catalog = inject(CatalogService);
  private readonly inventory = inject(InventoryService);
  private readonly bindersApi = inject(BindersService);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly toasts = inject(ToastService);
  private readonly gameContext = inject(GameContext);
  protected readonly auth = inject(AuthService);

  readonly id = input.required<string>();

  protected readonly detail = signal<SetDetail | null>(null);
  protected readonly printings = signal<PrintingSummary[]>([]);
  protected readonly names = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  private readonly page = signal(0);
  private readonly totalPages = signal(0);

  protected readonly adding = signal(false);
  protected readonly counts = signal<ReadonlyMap<string, number>>(new Map());
  protected readonly visibility = signal<Visibility>('PRIVATE');
  protected readonly binderId = signal<string | null>(null);
  protected readonly binders = signal<BinderResponse[] | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly set = computed(() => this.detail()?.set ?? null);
  protected readonly gameLabel = computed(() => gameInfo(this.set()?.game ?? '').label);
  protected readonly hasMore = computed(() => this.page() + 1 < this.totalPages());
  protected readonly notFound = computed(() => {
    const error = this.error();
    return !!error && (error.status === 404 || error.errorCode === 'VALIDATION_FAILED');
  });
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly printingCount = computed(
    () => this.set()?.printingCount ?? this.detail()?.printings?.totalItems ?? null,
  );
  /** "Released Nov 1, 2024 · 101 printings" (the set header may count, spec 7.5 and 17). */
  protected readonly metaLine = computed(() => {
    const set = this.set();
    const count = this.printingCount();
    const released = set?.releaseDate
      ? `Released ${new Date(`${set.releaseDate}T12:00:00`).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}`
      : null;
    const printings = count !== null ? `${count} ${count === 1 ? 'printing' : 'printings'}` : null;
    return [released, printings].filter(Boolean).join(' · ');
  });
  protected readonly chosen = computed(() =>
    [...this.counts().values()].reduce((sum, value) => sum + value, 0),
  );
  protected readonly gameBinders = computed(() =>
    sameGameBinders(this.binders() ?? [], this.set()?.game ?? ''),
  );
  protected readonly visibilityOptions: readonly SegmentOption<Visibility>[] = [
    { value: 'PRIVATE', label: 'Private' },
    { value: 'PUBLIC', label: 'Public' },
  ];
  protected readonly code = printingCode;
  protected readonly image = printingImageUrl;
  protected readonly cardsLabel = cardsLabel;

  private subscriptions: Subscription[] = [];

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => setTimeout(() => this.applyTitle()));
    inject(DestroyRef).onDestroy(() => this.subscriptions.forEach((sub) => sub.unsubscribe()));
  }

  protected reload(): void {
    this.load(this.id());
  }

  private load(id: string): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.subscriptions = [];
    this.detail.set(null);
    this.printings.set([]);
    this.loading.set(true);
    this.error.set(null);
    this.counts.set(new Map());
    this.fetch(id, 0);
    // The card names (the tiles' accessible names): the cards of the set, by card id.
    this.subscriptions.push(
      this.catalog
        .searchCards({ set: id, size: 100 }, 'body', false, { context: silentErrors() })
        .subscribe({
          next: (page) =>
            this.names.set(
              new Map((page.items ?? []).map((card) => [card.id ?? '', card.name ?? ''])),
            ),
          error: () => this.names.set(new Map()),
        }),
    );
  }

  private fetch(id: string, page: number): void {
    this.subscriptions.push(
      this.catalog
        .getSet({ id, page, size: SET_PAGE_SIZE }, 'body', false, { context: silentErrors() })
        .subscribe({
          next: (detail) => {
            this.detail.set(detail);
            const items = detail.printings?.items ?? [];
            this.printings.set(page === 0 ? items : [...this.printings(), ...items]);
            this.page.set(detail.printings?.page ?? page);
            this.totalPages.set(detail.printings?.totalPages ?? 0);
            this.loading.set(false);
            this.loadingMore.set(false);
            this.applyTitle();
            // A set of another game makes it the browsed game, as a card page does (spec 4.2).
            const game = detail.set?.game;
            if (page === 0 && game && this.gameContext.canBrowse(game)) {
              this.gameContext.select(game);
            }
          },
          error: (error: unknown) => {
            this.error.set(toApiError(error));
            this.loading.set(false);
            this.loadingMore.set(false);
          },
        }),
    );
  }

  protected loadMore(): void {
    if (this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    this.fetch(this.id(), this.page() + 1);
  }

  protected cardName(printing: PrintingSummary): string {
    return this.names().get(printing.cardId ?? '') ?? '';
  }

  protected tileLabel(printing: PrintingSummary): string {
    return [this.cardName(printing), printingCode(printing), printing.rarity]
      .filter(Boolean)
      .join(', ');
  }

  /** "Who has cards of this set": Search › Cards with the set code (spec 7.5). */
  protected whoHasQuery(): Record<string, string> {
    return { tab: 'cards', q: this.set()?.code ?? this.set()?.name ?? '' };
  }

  protected async toggleAdding(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/auth/sign-in'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    const next = !this.adding();
    this.adding.set(next);
    this.saveError.set(null);
    if (!next) {
      this.counts.set(new Map());
      return;
    }
    if (this.binders() === null) {
      try {
        const binders = await firstValueFrom(
          this.bindersApi.listMyBinders('body', false, { context: silentErrors() }),
        );
        this.binders.set(binders);
      } catch {
        this.binders.set([]);
      }
    }
  }

  protected count(printing: PrintingSummary): number {
    return this.counts().get(printing.id ?? '') ?? 0;
  }

  protected step(printing: PrintingSummary, delta: number): void {
    const id = printing.id;
    if (!id) {
      return;
    }
    const next = Math.min(Math.max(this.count(printing) + delta, 0), SET_STEPPER_MAX);
    const counts = new Map(this.counts());
    if (next === 0) {
      counts.delete(id);
    } else {
      counts.set(id, next);
    }
    this.counts.set(counts);
  }

  protected onBinder(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.binderId.set(value || null);
  }

  /** [Add n cards]: one create per tile, in order; a refusal stops and keeps what is left. */
  protected async add(): Promise<void> {
    const bodies = addBodies(this.counts(), this.visibility(), this.binderId());
    if (bodies.length === 0 || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    let added = 0;
    const left = new Map(this.counts());
    try {
      for (const body of bodies) {
        await firstValueFrom(
          this.inventory.createInventoryItem({ createInventoryItemRequest: body }, 'body', false, {
            context: silentErrors(),
          }),
        );
        added += body.quantity ?? 1;
        left.delete(body.printingId);
        this.counts.set(new Map(left));
      }
    } catch (error) {
      const apiError = toApiError(error);
      this.saveError.set(
        isLimitReached(apiError)
          ? 'You reached a limit. Every collector has the same limits. The cards not added stay chosen.'
          : `${friendlyMessage(apiError)} The cards not added stay chosen.`,
      );
    } finally {
      this.saving.set(false);
    }
    if (added > 0) {
      const binderId = this.binderId();
      const ref = this.toasts.show({ title: `${cardsLabel(added)} added`, action: 'View' });
      ref.onAction().subscribe(
        () =>
          void this.router.navigate(['/inventory'], {
            queryParams: binderId ? { binder: binderId } : {},
          }),
      );
    }
    if (this.counts().size === 0) {
      this.adding.set(false);
    }
  }

  private applyTitle(): void {
    const name = this.set()?.name;
    if (name) {
      this.title.setTitle(`${name} · ${APP_NAME}`);
    }
  }
}
