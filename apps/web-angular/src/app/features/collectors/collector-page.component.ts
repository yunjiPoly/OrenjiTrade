import { LiveAnnouncer } from '@angular/cdk/a11y';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { ShellIconComponent } from '../../core/layout/shell-icon/shell-icon.component';
import {
  CollectorProfileResponse,
  CollectorRating,
  CollectorsService,
  PublicBinderSummary,
  PublicBindersService,
  PublicInventoryItem,
  RatingSummaryResponse,
  ReferenceResponse,
  WishlistService,
} from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { ApiError, toApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { silentErrors } from '../../core/http/http-context';
import { BlockActionsService } from '../../shared/messaging/block-actions.service';
import { ChatDrawer } from '../../shared/messaging/chat-drawer.service';
import { ConversationStarterService } from '../../shared/messaging/conversation-starter.service';
import { ReportActionsService } from '../../shared/reports/report-actions.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { ToastService } from '../../core/feedback/toast.service';
import { GameContext } from '../../core/game/game-context.service';
import { ALL_GAMES } from '../../shared/domain/games';
import { IHaveIt } from '../../shared/wishlist/i-have-it.service';
import {
  CARDS_PREVIEW,
  CollectorProfileViewComponent,
  LookingForRow,
  lookingForOf,
  ownLookingFor,
} from './collector-profile-view/collector-profile-view.component';
import { CollectorRatingsSectionComponent } from './ratings/collector-ratings-section.component';

function gameOrder(slug: string): number {
  const index = ALL_GAMES.findIndex((game) => game.slug === slug);
  return index < 0 ? ALL_GAMES.length : index;
}

/** Cards per page once "See all" was pressed (the phone's pages of 24, R6). */
const CARDS_PAGE = 24;

type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; profile: CollectorProfileResponse }
  | { kind: 'members-only' }
  | { kind: 'not-found' }
  | { kind: 'error'; error: ApiError };

/**
 * `/collectors/:handle`: public collector profile (`GET /api/v1/collectors/{handle}`).
 * Members only: signed-out visitors are invited to sign in. 404 covers unknown, private,
 * suspended and deleted collectors alike, so nothing leaks about why.
 */
@Component({
  selector: 'app-collector-page',
  imports: [
    RouterLink,
    ShellIconComponent,
    MatButtonModule,
    CollectorProfileViewComponent,
    CollectorRatingsSectionComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="page">
      @switch (state().kind) {
        @case ('loading') {
          <div class="collector-skeleton" aria-busy="true">
            <span class="visually-hidden">Loading the collector profile</span>
            <app-skeleton height="132px" />
            <app-skeleton variant="list" lines="2" />
            <app-skeleton height="200px" />
          </div>
        }
        @case ('members-only') {
          <app-empty-state
            icon="lock_person"
            title="Sign in to see collector profiles"
            [level]="1"
            description="It's free. When you're done, you come right back here."
          >
            <a actions matButton="filled" routerLink="/auth/sign-in" [queryParams]="{ returnUrl }">
              Sign in
            </a>
            <a
              actions
              matButton="outlined"
              routerLink="/auth/sign-up"
              [queryParams]="{ returnUrl }"
            >
              Create account
            </a>
          </app-empty-state>
        }
        @case ('not-found') {
          <app-empty-state
            icon="person_off"
            title="This collector is not available"
            [level]="1"
            description="The profile does not exist, is private, or is no longer active."
          >
            <a actions matButton="filled" routerLink="/">Back to Home</a>
          </app-empty-state>
        }
        @case ('error') {
          <app-error-state
            title="We could not load this profile"
            retryLabel="Try again"
            [message]="errorMessage()"
            [requestId]="errorRequestId()"
            (retry)="load()"
          />
        }
        @case ('ready') {
          @if (profile(); as profile) {
            <!-- "← Home › {handle}" above a collector's profile (board W23; WE review U15). -->
            <nav class="crumbs" aria-label="Breadcrumb">
              <ol class="crumbs__list">
                <li class="crumbs__item">
                  <a class="crumbs__home" routerLink="/">
                    <app-shell-icon name="arrowLeft" [size]="18" [stroke]="2" />
                    Home
                  </a>
                  <app-shell-icon
                    class="crumbs__sep"
                    name="chevronRight"
                    [size]="16"
                    [stroke]="2"
                  />
                </li>
                <li class="crumbs__current" aria-current="page">{{ profile.handle }}</li>
              </ol>
            </nav>
            <app-collector-profile-view
              [profile]="profile"
              [isOwn]="isOwn()"
              [binders]="binders()"
              [bindersFailed]="bindersFailed()"
              [publicItems]="publicItems()"
              [publicItemCount]="publicItemCount()"
              [cardsFailed]="cardsFailed()"
              [cardsExpanded]="cardsExpanded()"
              [cardsHasMore]="cardsHasMore()"
              [cardsLoadingMore]="cardsLoadingMore()"
              [cardGame]="cardGame()"
              [cardGames]="cardGames()"
              [lookingFor]="lookingFor()"
              [messaging]="starter.starting() === profile.id || drawer.starting() === profile.id"
              [rating]="rating()"
              [references]="references()"
              (retryBinders)="loadListings(profile.handle)"
              (retryCards)="loadCards(profile.handle, false)"
              (messageRequested)="openConversation(profile.id)"
              (reportRequested)="report(profile)"
              (blockRequested)="block(profile)"
              (unblockRequested)="unblock(profile)"
              (shareRequested)="share(profile)"
              (ratingsRequested)="scrollToRatings()"
              (cardGameChange)="selectCardGame(profile.handle, $event)"
              (moreCards)="moreCards(profile.handle)"
              (haveIt)="offer(profile, $event.row, $event.opener)"
            />
            <app-collector-ratings-section
              class="collector-ratings"
              [profile]="profile"
              [isOwn]="isOwn()"
              (summaryChange)="onSummary($event)"
              (referencesChange)="references.set($event)"
            />
          }
        }
      }
    </div>
  `,
  styles: `
    .crumbs {
      max-width: 1120px;
      margin: 0 auto 20px;
    }
    .crumbs__list {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px;
      margin: 0 0 0 -8px;
      padding: 0;
      list-style: none;
      font-size: var(--font-size-sm);
      line-height: 20px;
    }
    .crumbs__item {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .crumbs__home {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 36px;
      padding: 0 10px 0 8px;
      border-radius: var(--radius-pill);
      color: var(--color-text-secondary);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .crumbs__home:hover {
      background: var(--color-surface-variant);
      color: var(--color-ink);
    }
    .crumbs__sep {
      color: var(--color-text-muted);
    }
    .crumbs__current {
      padding: 0 10px;
      overflow-wrap: anywhere;
      color: var(--color-text-muted);
    }
    .collector-ratings {
      display: block;
      max-width: 1120px;
      margin: 48px auto 0;
    }
    .collector-skeleton {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-5);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectorPageComponent {
  private readonly collectorsApi = inject(CollectorsService);
  private readonly bindersApi = inject(PublicBindersService);
  private readonly wishlistApi = inject(WishlistService);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly reports = inject(ReportActionsService);
  private readonly blocks = inject(BlockActionsService);
  private readonly injector = inject(Injector);
  private readonly doc = inject(DOCUMENT);
  private readonly toasts = inject(ToastService);
  private readonly gameContext = inject(GameContext);
  private readonly iHaveIt = inject(IHaveIt);
  private readonly announcer = inject(LiveAnnouncer);
  protected readonly starter = inject(ConversationStarterService);
  protected readonly drawer = inject(ChatDrawer);

  /** Bound from the `:handle` route parameter. */
  readonly handle = input.required<string>();
  /** `?tab=ratings` (RATING_RECEIVED deep link) scrolls to the ratings section. */
  readonly tab = input<string | undefined>();

  /** Rating summary re-read by the ratings section (after a new rating, for instance). */
  protected readonly rating = signal<CollectorRating | null>(null);
  /** The 2 latest references (from the ratings section). */
  protected readonly references = signal<ReferenceResponse[] | null>(null);

  protected readonly state = signal<ViewState>({ kind: 'loading' });
  /** Public binders of the collector (`null` while loading). */
  protected readonly binders = signal<PublicBinderSummary[] | null>(null);
  protected readonly bindersFailed = signal(false);
  /** The public cards shown (`null` while loading), their total, the pages read. */
  protected readonly publicItems = signal<PublicInventoryItem[] | null>(null);
  protected readonly publicItemCount = signal(0);
  protected readonly cardsFailed = signal(false);
  protected readonly cardsExpanded = signal(false);
  protected readonly cardsLoadingMore = signal(false);
  private readonly cardsPage = signal(0);
  private readonly cardsTotalPages = signal(0);
  protected readonly cardsHasMore = computed(() => this.cardsPage() + 1 < this.cardsTotalPages());
  /** The game the Cards show when the collector lists 2 or more games (spec 11). */
  protected readonly cardGame = signal<string | null>(null);
  /** Looking for: the public wishlist, or your own wishes (`null` while loading). */
  protected readonly lookingFor = signal<LookingForRow[] | null>(null);
  protected readonly profile = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.profile : null;
  });
  protected readonly isOwn = computed(() => {
    const profile = this.profile();
    const me = this.session.me();
    return !!profile && !!me && profile.id === me.id;
  });
  /**
   * The games the collector lists cards of (their public binders' games and the first cards'),
   * in the games' order: the Cards' control shows with 2 or more (spec 11). Not the profile's
   * followed games, which may differ from what is listed.
   */
  protected readonly cardGames = signal<string[]>([]);
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? friendlyMessage(state.error) : '';
  });
  protected readonly errorRequestId = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.error.requestId : null;
  });
  protected get returnUrl(): string {
    return this.router.url;
  }

  private subscription: Subscription | null = null;
  private listingsSubscription: Subscription | null = null;
  private cardsSubscription: Subscription | null = null;
  private scrolled = false;
  /** The first cards of every game (before the Cards split by game). */
  private firstCards: PublicInventoryItem[] | null = null;
  /** After Block or Unblock reloads the profile, the focus goes back to "⋯" (A3). */
  private refocusMore = false;
  /** "See all" or "Load more" was pressed: the focus goes to the first new card once in (A4). */
  private focusCardAt: number | null = null;

  constructor() {
    effect(() => {
      this.handle();
      untracked(() => void this.load());
    });
    inject(DestroyRef).onDestroy(() => {
      this.subscription?.unsubscribe();
      this.listingsSubscription?.unsubscribe();
      this.cardsSubscription?.unsubscribe();
    });
  }

  /**
   * "Report": the Report collector modal with the PROFILE context. It opens from the "⋯" menu,
   * whose item is gone once it closes: the focus goes back to "⋯", never to the page (A3).
   */
  protected async report(profile: CollectorProfileResponse): Promise<void> {
    await this.reports.report(
      {
        id: profile.id,
        displayName: profile.displayName,
        handle: profile.handle,
        avatarUrl: profile.avatarUrl,
      },
      { source: 'PROFILE' },
    );
    this.focusMore();
  }

  /**
   * "Block": confirmation + `POST /users/{id}/block`, then the profile reloads (blocked state);
   * the focus goes back to "⋯" either way (A3).
   */
  protected async block(profile: CollectorProfileResponse): Promise<void> {
    if (await this.blocks.block({ id: profile.id, displayName: profile.handle })) {
      this.refocusMore = true;
      await this.load();
    } else {
      this.focusMore();
    }
  }

  /** "Unblock": `DELETE /users/{id}/block`, then the profile reloads (the focus on "⋯"). */
  protected async unblock(profile: CollectorProfileResponse): Promise<void> {
    if (await this.blocks.unblock({ id: profile.id, displayName: profile.handle })) {
      this.refocusMore = true;
      await this.load();
    }
  }

  private focusMore(): void {
    afterNextRender(
      () => this.doc.querySelector<HTMLElement>('[data-testid="collector-more"]')?.focus(),
      { injector: this.injector },
    );
  }

  /** "Share profile": the browser's share sheet when it has one, else the link copied. */
  protected async share(profile: CollectorProfileResponse): Promise<void> {
    const url = `${this.doc.location.origin}/collectors/${encodeURIComponent(profile.handle)}`;
    const nav = this.doc.defaultView?.navigator;
    try {
      if (nav?.share) {
        await nav.share({ title: profile.handle, url });
        return;
      }
      await nav?.clipboard?.writeText(url);
      this.toasts.show({ title: 'Link copied', sub: `@${profile.handle}` });
    } catch {
      // Cancelled by the collector, or no clipboard: nothing to say.
    }
  }

  protected onSummary(summary: RatingSummaryResponse): void {
    this.rating.set({ average: summary.average ?? null, count: summary.count });
    if (this.tab() === 'ratings' && !this.scrolled) {
      this.scrolled = true;
      afterNextRender(() => this.scrollToRatings(), { injector: this.injector });
    }
  }

  protected scrollToRatings(): void {
    const section = this.doc.getElementById('collector-ratings');
    // No smooth scroll for a collector who asked for less motion (WE review A11, SC 2.3.3).
    const reduce = this.doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    section?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    section?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }

  /**
   * "Message": open (or start) the conversation in the chat drawer beside the profile (web stage
   * WC, spec 10.6), or on `/messages/:id` below 960.
   */
  protected async openConversation(recipientId: string): Promise<void> {
    await this.drawer.message({ recipientId }, this.doc.activeElement);
  }

  /** "I have it" on one of the collector's wishes (spec 11). */
  protected offer(
    profile: CollectorProfileResponse,
    row: LookingForRow,
    opener: EventTarget | null,
  ): void {
    if (!row.cardId) {
      return;
    }
    void this.iHaveIt.offer(
      profile.id,
      { cardId: row.cardId, name: row.name, printingId: row.printingId, rarity: row.rarity },
      opener,
    );
  }

  /** Public binders and Looking for (the public wishlist, or your own wishes with their ids). */
  protected loadListings(handle: string): void {
    this.listingsSubscription?.unsubscribe();
    this.binders.set(null);
    this.bindersFailed.set(false);
    this.lookingFor.set(null);
    this.listingsSubscription = new Subscription();
    if (this.isOwn()) {
      this.listingsSubscription.add(
        this.wishlistApi.listWishlist('body', false, { context: silentErrors() }).subscribe({
          next: (wishes) => this.lookingFor.set(ownLookingFor(wishes ?? [])),
          error: () => this.lookingFor.set([]),
        }),
      );
    } else {
      this.listingsSubscription.add(
        this.wishlistApi
          .getCollectorWishlist({ handle }, 'body', false, { context: silentErrors() })
          .subscribe({
            next: (entries) => this.lookingFor.set(lookingForOf(entries ?? [])),
            // 404: the collector does not show their wishlist (or it is not visible to the caller).
            error: () => this.lookingFor.set([]),
          }),
      );
    }
    this.listingsSubscription.add(
      this.bindersApi
        .listCollectorBinders({ handle }, 'body', false, { context: silentErrors() })
        .subscribe({
          next: (binders) => {
            this.binders.set(binders ?? []);
            this.splitByGame(handle);
          },
          error: () => {
            this.binders.set([]);
            this.bindersFailed.set(true);
          },
        }),
    );
  }

  /** The Cards' game control. */
  protected selectCardGame(handle: string, game: string): void {
    if (game !== this.cardGame()) {
      this.cardGame.set(game);
      this.loadCards(handle, false);
    }
  }

  /**
   * "See all" (pages of 24 from the start) and then "Load more". "See all" goes away and "Load
   * more" waits disabled, so the focus moves to the first card not shown before, once in (A4), and
   * screen readers hear "More cards are shown." (A6).
   */
  protected moreCards(handle: string): void {
    this.focusCardAt = this.publicItems()?.length ?? 0;
    if (!this.cardsExpanded()) {
      this.loadCards(handle, true);
    } else if (this.cardsHasMore() && !this.cardsLoadingMore()) {
      this.fetchCards(handle, this.cardsPage() + 1, CARDS_PAGE, true);
    }
  }

  /** The first cards: 12 (two rows of six), or 24 once See all was pressed. */
  protected loadCards(handle: string, expanded: boolean): void {
    this.cardsExpanded.set(expanded);
    this.publicItems.set(null);
    this.cardsFailed.set(false);
    this.fetchCards(handle, 0, expanded ? CARDS_PAGE : CARDS_PREVIEW, false);
  }

  private fetchCards(handle: string, page: number, size: number, append: boolean): void {
    this.cardsSubscription?.unsubscribe();
    const game = this.cardGame();
    this.cardsLoadingMore.set(append);
    this.cardsSubscription = this.bindersApi
      .listCollectorInventory(
        { handle, size, page, excludeDeckCoreItems: true, ...(game ? { game } : {}) },
        'body',
        false,
        { context: silentErrors() },
      )
      .subscribe({
        next: (result) => {
          const items = result.items ?? [];
          this.publicItems.set(append ? [...(this.publicItems() ?? []), ...items] : items);
          this.publicItemCount.set(result.totalItems ?? items.length);
          this.cardsPage.set(result.page ?? page);
          this.cardsTotalPages.set(result.totalPages ?? 0);
          this.cardsLoadingMore.set(false);
          if (!game && !append) {
            this.firstCards = items;
            this.splitByGame(handle);
          }
          this.focusNewCards();
        },
        error: () => {
          this.focusCardAt = null;
          this.cardsLoadingMore.set(false);
          if (!append) {
            this.publicItems.set([]);
            this.cardsFailed.set(true);
          }
        },
      });
  }

  private focusNewCards(): void {
    const index = this.focusCardAt;
    if (index === null) {
      return;
    }
    this.focusCardAt = null;
    void this.announcer.announce('More cards are shown.', 'polite');
    afterNextRender(
      () => {
        const links = this.doc.querySelectorAll<HTMLElement>('.cp__cards .cp__card-link');
        links[Math.min(index, links.length - 1)]?.focus();
      },
      { injector: this.injector },
    );
  }

  /**
   * Once the first cards (every game) and the binders are in: 2 or more games listed, the Cards
   * show one game at a time, the browsed one when listed (one more read).
   */
  private splitByGame(handle: string): void {
    const binders = this.binders();
    if (!this.firstCards || binders === null || this.cardGame() !== null) {
      return;
    }
    const listed = new Set<string>();
    binders.forEach((binder) => binder.games.forEach((game) => listed.add(game)));
    this.firstCards.forEach((item) => item.card.game && listed.add(item.card.game));
    const games = [...listed].sort((a, b) => gameOrder(a) - gameOrder(b));
    this.cardGames.set(games.length > 1 ? games : []);
    if (games.length > 1) {
      const browsed = this.gameContext.current();
      this.cardGame.set(games.includes(browsed) ? browsed : games[0]);
      this.loadCards(handle, false);
    }
  }

  protected async load(): Promise<void> {
    this.subscription?.unsubscribe();
    this.state.set({ kind: 'loading' });
    this.rating.set(null);
    this.references.set(null);
    this.scrolled = false;
    await this.auth.ready();
    if (!this.auth.isAuthenticated()) {
      this.state.set({ kind: 'members-only' });
      return;
    }
    this.subscription = this.collectorsApi
      .getCollector({ handle: this.handle() }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (profile) => {
          this.state.set({ kind: 'ready', profile });
          this.cardGame.set(null);
          this.cardGames.set([]);
          this.firstCards = null;
          if (this.refocusMore) {
            this.refocusMore = false;
            this.focusMore();
          }
          if (profile.isBlocked) {
            // Blocked by you: their cards, binders and wishes are not read at all (the view says
            // they stay hidden), never "could not load" with a Try again that cannot work (U2).
            this.listingsSubscription?.unsubscribe();
            this.cardsSubscription?.unsubscribe();
            this.binders.set([]);
            this.bindersFailed.set(false);
            this.lookingFor.set([]);
            this.publicItems.set([]);
            this.publicItemCount.set(0);
            this.cardsFailed.set(false);
            return;
          }
          this.loadListings(profile.handle);
          this.loadCards(profile.handle, false);
        },
        error: (error: unknown) => {
          const apiError = toApiError(error);
          if (apiError.status === 404) {
            this.state.set({ kind: 'not-found' });
          } else if (apiError.status === 401) {
            this.state.set({ kind: 'members-only' });
          } else {
            this.state.set({ kind: 'error', error: apiError });
          }
        },
      });
  }
}
