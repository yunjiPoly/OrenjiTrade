import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  AdminCatalogService,
  CatalogGameSummary,
  GameRequest,
  GameResponse,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { GamesStore } from '../../../shared/catalog/games.store';
import { ToastService } from '../../../core/feedback/toast.service';
import { AdminIconComponent } from '../console/admin-icon.component';
import { RECORDED, runConsoleAction } from '../console/console-actions';
import { GameBadgeComponent } from '../console/game-badge.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { GameEditorComponent } from './game-editor.component';

/**
 * `/admin/games` (`?game=<slug>` selects one): every game including hidden ones, and the editor
 * of the selected game with its schema. Saves are audited (`game.update`).
 */
@Component({
  selector: 'app-admin-games-page',
  imports: [
    DatePipe,
    RouterLink,
    AdminIconComponent,
    ErrorStateComponent,
    GameBadgeComponent,
    GameEditorComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="cp">
      <header class="cp__head">
        <div class="cp__heading">
          <p class="cp__eyebrow">Catalog</p>
          <h1 class="cp__title">Games</h1>
          <p class="cp__sub">
            Supported games, their order and the schema that drives catalog fields and filters.
          </p>
        </div>
        <div class="cp__actions">
          <button type="button" class="cb cb--outline" (click)="select('new')">
            <app-admin-icon name="plus" [size]="18" />
            New game
          </button>
        </div>
      </header>

      @if (error(); as error) {
        <app-error-state
          title="Games could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          retryLabel="Try again"
          (retry)="load()"
        />
      } @else if (games(); as list) {
        <div class="games">
          <section class="cp-card games__list-card" aria-labelledby="games-list-title">
            <div class="games__list-head">
              <h2 class="cp-card__title" id="games-list-title">In display order</h2>
              <span class="cp-muted"
                >{{ list.length }} {{ list.length === 1 ? 'game' : 'games' }}</span
              >
            </div>
            @if (list.length === 0) {
              <p class="cp-muted games__empty">No games yet.</p>
            }
            <nav class="games__list" aria-label="Games">
              @for (game of list; track game.slug) {
                @let current = game.slug === selectedSlug();
                <button
                  type="button"
                  class="games__item"
                  [class.games__item--on]="current"
                  [attr.aria-current]="current || null"
                  (click)="select(game.slug)"
                >
                  <app-game-badge [game]="game.slug ?? ''" />
                  <span class="games__names">
                    <span class="games__name">{{ game.shortName || game.name }}</span>
                    <span class="games__slug">
                      <span class="cp-mono">{{ game.slug }}</span> · #{{ game.sortOrder }}
                    </span>
                    <span class="games__cards" [class.games__cards--soon]="!cardsOf(game.slug)">
                      {{ cardsLine(game.slug) }}
                    </span>
                  </span>
                  <span class="cp-chip" [class.cp-chip--success]="game.status !== 'HIDDEN'">{{
                    game.status === 'HIDDEN' ? 'Hidden' : 'Active'
                  }}</span>
                </button>
              }
            </nav>
            <p class="games__foot">
              Lower display order comes first in every game picker. Slugs never change once created.
            </p>
          </section>
          @if (creating()) {
            <section class="cp-card games__editor" aria-labelledby="game-editor-title">
              <h2 class="cp-card__title" id="game-editor-title">New game</h2>
              <p class="games__note">
                <app-admin-icon name="info" [size]="18" />
                A new game starts hidden; make it active once its schema is right.
              </p>
              <app-game-editor
                [game]="blank"
                [creating]="true"
                [saving]="saving()"
                [serverErrors]="serverErrors()"
                (save)="create($event)"
              />
            </section>
          } @else if (selected(); as game) {
            <section class="cp-card games__editor" aria-labelledby="game-editor-title">
              <div class="games__editor-head">
                <app-game-badge [game]="game.slug ?? ''" />
                <div>
                  <h2 class="cp-card__title" id="game-editor-title">{{ game.name }}</h2>
                  <p class="cp-muted games__meta">
                    <span class="cp-mono">{{ game.slug }}</span>
                    @if (game.updatedAt) {
                      · Changed {{ game.updatedAt | date: 'MMM d' }}
                    }
                  </p>
                </div>
                <span class="cp-chip" [class.cp-chip--success]="game.status !== 'HIDDEN'">{{
                  game.status === 'HIDDEN' ? 'Hidden' : 'Active'
                }}</span>
              </div>
              @if (summaries() && !cardsOf(game.slug)) {
                <p class="games__soon" role="note">
                  <app-admin-icon name="alert" [size]="18" />
                  <span>
                    No cards yet. Collectors see “Cards coming soon”: the game shows in the game
                    picker but can’t be picked on Home or Search, and its rooms stay open. Import
                    cards in
                    <a class="cp-link" routerLink="/admin/card-data">Card data and images</a>
                    once a source is approved.
                  </span>
                </p>
              }
              <app-game-editor
                [game]="game"
                [saving]="saving()"
                [serverErrors]="serverErrors()"
                (save)="save(game, $event)"
              />
            </section>
          }
        </div>
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading games</span>
          <app-skeleton variant="list" lines="4" />
        </div>
      }
    </div>
  `,
  styleUrls: ['../console/console-page.scss', '../console/console-controls.scss'],
  styles: `
    .games {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      gap: 24px;
      align-items: start;
    }
    .games__list-card,
    .games__editor {
      padding: 20px 22px;
    }
    .games__list-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 12px;
      font-size: var(--font-size-sm);
    }
    .games__list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .games__item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid transparent;
      border-radius: 12px;
      background: none;
      color: var(--color-ink);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .games__item:hover {
      background: var(--color-surface-variant);
    }
    .games__item:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .games__item--on {
      border-color: var(--color-primary);
      background: var(--color-primary-tint);
    }
    .games__names {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
    }
    .games__name {
      font-weight: var(--font-weight-semibold);
    }
    .games__slug,
    .games__cards {
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }
    .games__cards--soon {
      color: var(--app-warning-text);
    }
    .games__foot,
    .games__empty {
      margin: 12px 0 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }
    .games__editor-head {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
    }
    .games__editor-head > div {
      flex: 1 1 auto;
      min-width: 0;
    }
    .games__meta {
      margin: 2px 0 0;
      font-size: var(--font-size-sm);
    }
    .games__soon,
    .games__note {
      display: flex;
      gap: 10px;
      margin: 0 0 16px;
      padding: 12px 14px;
      border-radius: 12px;
      font-size: var(--font-size-sm);
    }
    .games__soon {
      border: 1px solid color-mix(in srgb, var(--color-warning) 45%, transparent);
      background: color-mix(in srgb, var(--color-warning) 12%, transparent);
      color: var(--color-ink);
    }
    .games__soon app-admin-icon {
      color: var(--app-warning-text);
    }
    .games__note {
      background: var(--color-surface-variant);
      color: var(--color-text-secondary);
    }
    @media (max-width: 1279.98px) {
      .games {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminGamesPageComponent {
  private readonly api = inject(AdminCatalogService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly publicGames = inject(GamesStore);

  /** `?game=` query parameter. */
  readonly game = input<string | undefined>();

  protected readonly games = signal<GameResponse[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly saving = signal(false);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly selected = computed(() => {
    const list = this.games() ?? [];
    return list.find((game) => game.slug === this.game()) ?? list[0] ?? null;
  });

  protected readonly selectedSlug = computed(() =>
    this.creating() ? null : (this.selected()?.slug ?? null),
  );
  /** "New game" (`?game=new`). */
  protected readonly creating = computed(() => this.game() === 'new');
  /** Each game's catalogue (`GET /admin/catalog/games`): "13,942 cards" or "Cards coming soon". */
  protected readonly summaries = signal<CatalogGameSummary[] | null>(null);
  /** A new game's starting point (board A13's NEW_SCHEMA). */
  protected readonly blank: GameResponse = {
    slug: '',
    name: '',
    shortName: '',
    publisher: '',
    status: 'HIDDEN',
    sortOrder: 50,
    schema: {
      conditions: [
        'MINT',
        'NEAR_MINT',
        'LIGHTLY_PLAYED',
        'MODERATELY_PLAYED',
        'HEAVILY_PLAYED',
        'DAMAGED',
      ],
      editions: ['UNLIMITED'],
      languages: ['en'],
      finishes: ['NORMAL'],
      rarities: ['Common'],
      metadataFields: [],
      summaryFields: [],
    },
  } as unknown as GameResponse;

  protected cardsOf(slug: string | undefined): number {
    return this.summaries()?.find((summary) => summary.game === slug)?.cards ?? 0;
  }

  protected cardsLine(slug: string | undefined): string {
    if (!this.summaries()) {
      return '';
    }
    const cards = this.cardsOf(slug);
    return cards
      ? `${cards.toLocaleString('en-US')} ${cards === 1 ? 'card' : 'cards'}`
      : 'Cards coming soon';
  }

  constructor() {
    void this.load();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected select(slug: string | undefined): void {
    this.serverErrors.set({});
    void this.router.navigate([], { queryParams: { game: slug }, replaceUrl: true });
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      const [games, summaries] = await Promise.all([
        firstValueFrom(this.api.listAdminGames('body', false, { context: silentErrors() })),
        firstValueFrom(this.api.listCatalogGames('body', false, { context: silentErrors() })).catch(
          () => null,
        ),
      ]);
      this.games.set(games ?? []);
      this.summaries.set(summaries);
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  protected async create(request: GameRequest): Promise<void> {
    this.saving.set(true);
    this.serverErrors.set({});
    const created = await runConsoleAction(
      this.toasts,
      this.api.createGame({ gameRequest: request }, 'body', false, { context: silentErrors() }),
      `${request.name} created.`,
      `A game with the slug ${request.slug} already exists.`,
    );
    this.saving.set(false);
    if (created) {
      this.games.update((list) => [...(list ?? []), created]);
      void this.publicGames.load(true);
      this.select(created.slug);
    }
  }

  protected async save(game: GameResponse, request: GameRequest): Promise<void> {
    if (!game.slug) {
      return;
    }
    this.saving.set(true);
    this.serverErrors.set({});
    try {
      const updated = await firstValueFrom(
        this.api.updateGame({ slug: game.slug, gameRequest: request }, 'body', false, {
          context: silentErrors(),
        }),
      );
      this.games.update((list) =>
        (list ?? []).map((candidate) => (candidate.slug === updated.slug ? updated : candidate)),
      );
      this.toasts.show({ title: `${updated.name} saved.`, sub: RECORDED });
      void this.publicGames.load(true);
    } catch (error) {
      const apiError = toApiError(error);
      this.serverErrors.set(apiError.fieldErrors);
      this.toasts.show({
        title: friendlyMessage(apiError),
        sub: apiError.requestId ? `Request ${apiError.requestId}` : null,
        tone: 'error',
      });
    } finally {
      this.saving.set(false);
    }
  }
}
