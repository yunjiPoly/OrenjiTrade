import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import type { PublicBinderResponse, PublicInventoryItem } from '@orenji/api-client';
import { debounceTime, distinctUntilChanged, filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { ToastService } from '../../core/feedback/toast.service';
import { GameContext } from '../../core/game/game-context.service';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { ShellIconComponent } from '../../core/layout/shell-icon/shell-icon.component';
import { APP_NAME } from '../../core/routing/orenji-title.strategy';
import { QUERY_MAX_LENGTH } from '../../shared/catalog/catalog-constants';
import {
  BINDER_SORTS,
  BinderSort,
  BinderViewStore,
  binderLimitMessage,
  isBinderSort,
  updatedLabel,
} from '../../shared/discovery/binder-view/binder-view.store';
import {
  BinderCardsComponent,
  BinderOwnerComponent,
  KeyCardsComponent,
  ratingText,
} from '../../shared/discovery/binder-view/binder-parts.component';
import { DeckCoreGalleryComponent } from '../../shared/discovery/binder-view/deck-core-gallery.component';
import { gameInfo } from '../../shared/domain/games';
import { ChatDrawer } from '../../shared/messaging/chat-drawer.service';
import { ReportActionsService } from '../../shared/reports/report-actions.service';
import { GameMonogramComponent } from '../../shared/ui/game-monogram/game-monogram.component';

/** The game of a public binder (one game since stage G). */
function binderGame(binder: PublicBinderResponse | null): string | null {
  return binder?.games?.[0] ?? null;
}

/**
 * `/binders/:id` (spec 8, boards W8 and W9; web stage WD): a public binder or a deck core, open to
 * everyone. Opening the page spends one public binder view (`GET /public/binders/{id}`, members
 * only, 30 a day); searching, sorting and "Load more" spend none, and Message never does.
 *
 * - A deck core (container 1120): the gallery of its photos (680, thumbnails, ←/→, a lightbox),
 *   the key cards, and a sticky panel: the tags, the name, the price, "20 cards · Updated today",
 *   the seller card, [Message …] (orange 52) or [Manage in Inventory] for one's own, the note, the
 *   shipping and safety lines, and "⋯" (Share, Report).
 * - A binder (container 1200): the game tile, the name, "Public binder", the owner row, [Message …]
 *   (tonal) or [Manage in Inventory], "⋯"; "Search this binder" and the sort pill (Recently added,
 *   Name, Price) in the URL; the cards grid with "Load more".
 *
 * Only what the owner made public is shown: never private notes, never a city (the owner block
 * carries the state or province and country, ADR 0017). A guest sees "A collector" with the
 * province (R15); Message asks them to sign in.
 */
@Component({
  selector: 'app-public-binder-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatMenuModule,
    BinderCardsComponent,
    BinderOwnerComponent,
    DeckCoreGalleryComponent,
    GameMonogramComponent,
    KeyCardsComponent,
    ShellIconComponent,
  ],
  providers: [BinderViewStore],
  templateUrl: './public-binder-page.component.html',
  styleUrl: './public-binder-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicBinderPageComponent {
  protected readonly store = inject(BinderViewStore);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly reports = inject(ReportActionsService);
  private readonly chatDrawer = inject(ChatDrawer);
  private readonly gameContext = inject(GameContext);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly document = inject(DOCUMENT);

  /** Route parameter and query parameters (bound by the router). */
  readonly id = input.required<string>();
  readonly q = input<string | undefined>();
  readonly sort = input<string | undefined>();

  protected readonly sorts = BINDER_SORTS;
  protected readonly maxLength = QUERY_MAX_LENGTH;
  protected readonly bones = [0, 1, 2, 3, 4, 5, 6];
  protected readonly query = new FormControl('', { nonNullable: true });

  protected readonly binder = this.store.binder;
  protected readonly isCore = computed(() => !!this.binder()?.sellsAsCore);
  protected readonly isOwn = computed(() => {
    const me = this.session.me();
    return !!me && !!this.binder()?.owner?.id && this.binder()?.owner?.id === me.id;
  });
  protected readonly game = computed(() => binderGame(this.binder()));
  protected readonly gameLabel = computed(() => gameInfo(this.game() ?? '').label);
  protected readonly rating = computed(() => ratingText(this.store.rating()));
  protected readonly province = computed(
    () => this.binder()?.owner?.place?.subdivisionName ?? null,
  );
  protected readonly stateCode = computed(
    () => this.binder()?.owner?.place?.subdivisionCode ?? null,
  );
  protected readonly facts = computed(() => {
    const binder = this.binder();
    if (!binder) {
      return '';
    }
    const cards = `${binder.itemCount} ${binder.itemCount === 1 ? 'card' : 'cards'}`;
    return [cards, updatedLabel(binder.freshness?.updatedAt)].filter(Boolean).join(' · ');
  });
  protected readonly currentSort = computed<BinderSort>(() => {
    const sort = this.sort();
    return isBinderSort(sort) ? sort : 'recent';
  });
  protected readonly sortLabel = computed(
    () => BINDER_SORTS.find((entry) => entry.value === this.currentSort())?.label ?? '',
  );
  protected readonly limitMessage = computed(() => {
    const state = this.store.state();
    return state.kind === 'limit' ? binderLimitMessage(state.info) : '';
  });
  protected readonly errorMessage = computed(() => {
    const state = this.store.state();
    return state.kind === 'error' ? friendlyMessage(state.error) : '';
  });
  protected readonly canMessage = computed(() => !this.isOwn());

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.store.open(id));
    });
    effect(() => {
      const q = (this.q() ?? '').trim().slice(0, QUERY_MAX_LENGTH);
      const sort = this.currentSort();
      untracked(() => {
        if (this.query.value.trim() !== q) {
          this.query.setValue(q, { emitEvent: false });
        }
        this.store.setFilters(q, sort);
      });
    });
    // Opening a binder of another game makes it the browsed game (spec 4.2).
    effect(() => {
      const game = this.game();
      untracked(() => {
        if (game && this.gameContext.canBrowse(game)) {
          this.gameContext.select(game);
        }
        this.applyTitle();
      });
    });
    this.query.valueChanges
      .pipe(
        map((value) => value.trim().slice(0, QUERY_MAX_LENGTH)),
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((q) => {
        if (q !== (this.q() ?? '').trim()) {
          this.navigate({ q: q || null }, true);
        }
      });
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => setTimeout(() => this.applyTitle()));
  }

  protected reload(): void {
    void this.store.open(this.id());
  }

  protected setSort(sort: BinderSort): void {
    this.navigate({ sort: sort === 'recent' ? null : sort }, true);
  }

  /** "Search" › "Binders in Quebec" (the state's list in Search). */
  protected stateQuery(): Record<string, string> {
    const code = this.stateCode();
    return {
      tab: 'binders',
      ...(code ? { state: code } : {}),
      ...(this.isCore() ? { kind: 'deckcores' } : {}),
    };
  }

  /** "Message": the chat drawer, about the deck core when the binder sells as one (stage R4). */
  protected messageOwner(binder: PublicBinderResponse, opener: EventTarget | null): void {
    if (!this.auth.isAuthenticated() || !binder.owner?.id) {
      this.signIn();
      return;
    }
    void this.chatDrawer.message(
      {
        recipientId: binder.owner.id,
        ...(binder.sellsAsCore ? { subjectBinderId: binder.id } : {}),
      },
      opener,
    );
  }

  /** "Message about this card" on a tile: the chat drawer about that copy. */
  protected messageAbout(item: PublicInventoryItem, opener: EventTarget | null): void {
    const binder = this.binder();
    if (!this.auth.isAuthenticated() || !binder?.owner?.id) {
      this.signIn();
      return;
    }
    void this.chatDrawer.message({ recipientId: binder.owner.id, subjectItemId: item.id }, opener);
  }

  protected async reportOwner(binder: PublicBinderResponse): Promise<void> {
    if (!this.auth.isAuthenticated() || !binder.owner?.id) {
      this.signIn();
      return;
    }
    await this.reports.report(
      {
        id: binder.owner.id,
        displayName: binder.owner.displayName,
        handle: binder.owner.handle,
        avatarUrl: binder.owner.avatarUrl,
      },
      { source: 'BINDER', binderId: binder.id },
    );
  }

  /** Share: the browser's share sheet when it has one, else the link copied. */
  protected async share(binder: PublicBinderResponse): Promise<void> {
    const url = this.document.location.href.split('?')[0];
    const nav = this.document.defaultView?.navigator;
    try {
      if (nav?.share) {
        await nav.share({ title: binder.name, url });
        return;
      }
      await nav?.clipboard?.writeText(url);
      this.toasts.show({ title: 'Link copied', sub: binder.name });
    } catch {
      // Cancelled by the collector, or no clipboard: nothing to say.
    }
  }

  private signIn(): void {
    void this.router.navigate(['/auth/sign-in'], { queryParams: { returnUrl: this.router.url } });
  }

  private navigate(queryParams: Record<string, string | null>, replaceUrl = false): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl });
  }

  private applyTitle(): void {
    const name = this.binder()?.name;
    if (name) {
      this.title.setTitle(`${name} · ${APP_NAME}`);
    }
  }
}
