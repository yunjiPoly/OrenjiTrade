import { GuestActions } from '../../../core/guest/guest-actions.service';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { LiveAnnouncer } from '@angular/cdk/a11y';
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
import { specialEdition, specialFinish } from '../../../shared/wishlist/wishlist-labels';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../../shared/ui/segmented/segmented.component';
import { binderGame } from '../../inventory/data/binder-games';

/** Printings per page of a set (the API's maximum). */
export const SET_PAGE_SIZE = 200;
/** Card names per page (`GET /cards?set=`, the API's maximum); every page is read. */
export const SET_NAMES_PAGE_SIZE = 100;
/** A ceiling on the name pages of one set (10,000 cards), against a server that never ends. */
const SET_NAMES_MAX_PAGES = 100;
/** "I have" at most this many copies of one printing in one go (the phone's stepper). */
export const SET_STEPPER_MAX = 99;

type Visibility = 'PRIVATE' | 'PUBLIC';

/** "7 cards", "1 card". */
export function cardsLabel(count: number): string {
  return `${count} ${count === 1 ? 'card' : 'cards'}`;
}

/**
 * What tells a printing apart from another of the same code on one set (a 1st Edition and an
 * Unlimited `AZR-EN011`): its edition (Unlimited named too, then) and a finish other than Normal.
 * Empty when its code is its own.
 */
export function printingDistinction(
  printing: PrintingSummary,
  printings: readonly PrintingSummary[],
): string {
  const code = printingCode(printing);
  const shared = !!code && printings.filter((other) => printingCode(other) === code).length > 1;
  if (!shared) {
    return '';
  }
  return [
    specialEdition(printing.edition) ?? (printing.edition ? 'Unlimited' : null),
    specialFinish(printing.finish),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Whether a focused stepper or tile is scrolled above the sticky footer of "Add from this set": it
 * reaches within 12 px of the footer, and the keyboard focused it (a pointer press keeps its place,
 * or its click is lost: WD review R1-2).
 */
export function liftsAboveFooter(bottom: number, footTop: number, keyboard: boolean): boolean {
  return keyboard && bottom > footTop - 12;
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
  private readonly guest = inject(GuestActions);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly announcer = inject(LiveAnnouncer);

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
    // Back from signing in: "Add from this set" asked as a guest opens the adding mode.
    effect(() => {
      const id = this.id();
      if (!this.detail() || !this.guest.ready()) {
        return;
      }
      untracked(() => {
        if (this.guest.take((action) => action.kind === 'add' && action.setId === id)) {
          void this.toggleAdding().then(() => this.saySignedInAdding());
        }
      });
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
    this.names.set(new Map());
    this.fetch(id, 0);
    this.loadNames(id, 0);
  }

  /**
   * The card names (the tiles' accessible names and the stepper labels): every page of the set's
   * cards, by card id (a set can hold more than one page of 100 cards, WD review F6).
   */
  private loadNames(id: string, page: number): void {
    this.subscriptions.push(
      this.catalog
        .searchCards({ set: id, page, size: SET_NAMES_PAGE_SIZE }, 'body', false, {
          context: silentErrors(),
        })
        .subscribe({
          next: (result) => {
            if (id !== this.id()) {
              return;
            }
            const names = new Map(this.names());
            for (const card of result.items ?? []) {
              names.set(card.id ?? '', card.name ?? '');
            }
            this.names.set(names);
            const next = (result.page ?? page) + 1;
            if (next < (result.totalPages ?? 0) && next < SET_NAMES_MAX_PAGES) {
              this.loadNames(id, next);
            }
          },
          // The tiles keep their code and rarity; the names that came stay.
          error: () => undefined,
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

  /** "1st Edition" on a tile whose code another printing of the set shares. */
  protected distinction(printing: PrintingSummary): string {
    return printingDistinction(printing, this.printings());
  }

  protected tileLabel(printing: PrintingSummary): string {
    return [
      this.cardName(printing),
      printingCode(printing),
      printing.rarity,
      this.distinction(printing),
    ]
      .filter(Boolean)
      .join(', ');
  }

  /** "One more AZR-EN011, 1st Edition": two steppers of one code are told apart. */
  protected stepLabel(prefix: string, printing: PrintingSummary): string {
    const distinction = this.distinction(printing);
    return `${prefix} ${printingCode(printing)}${distinction ? `, ${distinction}` : ''}`;
  }

  /**
   * "Who has cards of this set": Search › Cards on the cards of this set, every page of them,
   * with or without a text (spec 7.5; the phone's set chip, stage R14).
   */
  protected whoHasQuery(): Record<string, string> {
    return { tab: 'cards', set: this.id() };
  }

  /**
   * A stepper or tile the keyboard focused under the sticky footer is scrolled above it (SC
   * 2.4.11). A pointer press focuses its button before the click: a scroll then would move the
   * button from under the finger and lose the click (WD review R1-2), so only a keyboard focus
   * (`:focus-visible`) scrolls.
   */
  protected onGridFocus(event: FocusEvent): void {
    if (!this.adding()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const foot = this.host.nativeElement.querySelector<HTMLElement>('.sp__foot');
    if (!target || !foot) {
      return;
    }
    if (
      liftsAboveFooter(
        target.getBoundingClientRect().bottom,
        foot.getBoundingClientRect().top,
        target.matches(':focus-visible'),
      )
    ) {
      target.scrollIntoView({ block: 'center' });
    }
  }

  /**
   * The adding mode a guest asked for, opened after signing in: said, with the keyboard on "Stop
   * adding" as after a member's own press (WG review A7, SC 4.1.3).
   */
  private saySignedInAdding(): void {
    if (!this.adding()) {
      return;
    }
    const name = this.set()?.name;
    void this.announcer.announce(name ? `Adding from ${name}` : 'Adding from this set', 'polite');
    setTimeout(() =>
      this.host.nativeElement.querySelector<HTMLElement>('[data-testid="add-from-set"]')?.focus(),
    );
  }

  protected async toggleAdding(event?: Event): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      // A guest: "Sign in to add your cards"; back here, the set's adding mode opens (spec 14).
      void this.guest.ask({ kind: 'add', setId: this.id() }, null, event?.currentTarget ?? null);
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
      // The footer and its button are gone: the focus returns to "Add from this set" (SC 2.4.3).
      setTimeout(() =>
        this.host.nativeElement.querySelector<HTMLElement>('[data-testid="add-from-set"]')?.focus(),
      );
    }
  }

  private applyTitle(): void {
    const name = this.set()?.name;
    if (name) {
      this.title.setTitle(`${name} · ${APP_NAME}`);
    }
  }
}
