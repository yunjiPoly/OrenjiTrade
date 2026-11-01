import { A11yModule } from '@angular/cdk/a11y';
import { DOCUMENT } from '@angular/common';
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
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Router, RouterLink } from '@angular/router';
import {
  CatalogService,
  PageResponseCardSummary,
  SearchCardsRequestParams,
} from '@orenji/api-client';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { QUERY_MAX_LENGTH } from '../../../shared/catalog/catalog-constants';
import { GamesStore } from '../../../shared/catalog/games.store';
import { gameInfo } from '../../../shared/domain/games';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminIconComponent } from '../console/admin-icon.component';
import { GameBadgeComponent } from '../console/game-badge.component';
import { AdminCardEditPageComponent } from './admin-card-edit-page.component';

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * `/admin/cards` (spec 15.6, board A11): today's search, game filter and table, with the card
 * editor in a 520 drawer beside the list (`?open=<id>`, the URL names the card; "New card" is
 * `?open=new`), previous and next card, and Add printing in the drawer. The sync panel moved to
 * Card data and images.
 */
@Component({
  selector: 'app-admin-cards-page',
  imports: [
    A11yModule,
    RouterLink,
    MatPaginatorModule,
    AdminCardEditPageComponent,
    AdminIconComponent,
    CardImageComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    GameBadgeComponent,
    SkeletonComponent,
  ],
  templateUrl: './admin-cards-page.component.html',
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    '../console/console-table.scss',
    '../console/console-drawer.scss',
    './admin-cards-page.component.scss',
  ],
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCardsPageComponent {
  private readonly api = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  protected readonly games = inject(GamesStore);

  readonly query = input<string | undefined>();
  readonly game = input<string | undefined>();
  readonly page = input<string | undefined>();
  readonly size = input<string | undefined>();
  /** The card open in the drawer (`new` for New card). */
  readonly open = input<string | undefined>();

  protected readonly maxLength = QUERY_MAX_LENGTH;
  protected readonly pageSizes = PAGE_SIZE_OPTIONS;
  protected readonly result = signal<PageResponseCardSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly params = computed<SearchCardsRequestParams>(() => {
    const size = toInt(this.size(), 20);
    return {
      query: this.query()?.trim().slice(0, QUERY_MAX_LENGTH) || undefined,
      game: this.game()?.trim() || undefined,
      page: toInt(this.page(), 0),
      size: PAGE_SIZE_OPTIONS.includes(size) ? size : 20,
    };
  });
  protected readonly openId = computed(() => {
    const open = this.open();
    return open === 'new' || UUID.test(open ?? '') ? (open as string) : null;
  });
  /** "2 of 14": the open card's place among the page's rows (board A11). */
  protected readonly position = computed(() => {
    const id = this.openId();
    const items = this.result()?.items ?? [];
    const index = items.findIndex((card) => card.id === id);
    return index < 0 ? null : { index, total: items.length };
  });
  protected readonly countLine = computed(() => {
    const total = this.result()?.totalItems ?? 0;
    const game = this.params().game;
    const name = game ? `${this.gameLabel(game)} ` : '';
    return `${total.toLocaleString('en-US')} ${name}${total === 1 ? 'card' : 'cards'}`;
  });
  protected readonly range = computed(() => {
    const page = this.result();
    const total = page?.totalItems ?? 0;
    if (!page || !total) {
      return '';
    }
    const start = (page.page ?? 0) * (page.size ?? 20) + 1;
    return `${start}–${start + (page.items ?? []).length - 1} of ${total.toLocaleString('en-US')}`;
  });

  private readonly searches = new Subject<string>();
  private subscription: Subscription | null = null;
  private opener: HTMLElement | null = null;

  constructor() {
    void this.games.load();
    effect(() => {
      const params = this.params();
      untracked(() => this.load(params));
    });
    this.searches
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((query) => this.navigate({ query: query.trim() || null, page: null }));
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected reload(): void {
    this.load(this.params());
  }

  protected gameLabel(slug: string | undefined): string {
    return gameInfo(slug ?? '').shortLabel;
  }

  protected onSearch(event: Event): void {
    this.searches.next((event.target as HTMLInputElement).value);
  }

  protected setGame(game: string | null): void {
    this.navigate({ game, page: null });
  }

  protected setSize(size: number): void {
    this.navigate({ size: size === 20 ? null : size, page: null });
  }

  protected onPage(event: PageEvent): void {
    this.navigate({ page: event.pageIndex || null });
  }

  /** Opens a card (or New card) in the drawer; Esc and Close give the focus back. */
  protected openCard(id: string, event?: Event): void {
    if (event) {
      this.opener = event.currentTarget as HTMLElement;
    }
    this.navigate({ open: id });
  }

  protected step(delta: number): void {
    const position = this.position();
    const items = this.result()?.items ?? [];
    const next = position ? items[position.index + delta] : null;
    if (next?.id) {
      this.navigate({ open: next.id });
    }
  }

  protected closeDrawer(): void {
    const id = this.openId();
    this.navigate({ open: null });
    const opener =
      this.opener ??
      (id ? this.document.querySelector<HTMLElement>(`[data-card-open="${id}"]`) : null);
    this.opener = null;
    setTimeout(() => opener?.focus());
  }

  protected onEscape(event: Event): void {
    if (!this.openId() || event.defaultPrevented) {
      return;
    }
    if (this.document.querySelector('.cdk-overlay-container [role="dialog"]')) {
      return;
    }
    event.preventDefault();
    this.closeDrawer();
  }

  private navigate(queryParams: Record<string, string | number | null>): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge' });
  }

  private load(params: SearchCardsRequestParams): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.subscription = this.api
      .searchCards(params, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (page) => {
          this.result.set(page);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(toApiError(error));
          this.loading.set(false);
        },
      });
  }
}
