import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { AdminCatalogService, GameRequest, GameResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { GamesStore } from '../../../shared/catalog/games.store';
import { gameInfo } from '../../../shared/domain/games';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { GameEditorComponent } from './game-editor.component';

/**
 * `/admin/games` (`?game=<slug>` selects one): every game including hidden ones, and the editor
 * of the selected game with its schema. Saves are audited (`game.update`).
 */
@Component({
  selector: 'app-admin-games-page',
  imports: [
    MatIconModule,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
    GameEditorComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Games"
        subtitle="Supported games, their order and the schema that drives catalog fields and filters."
      />

      @if (error(); as error) {
        <app-error-state
          title="Games could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="load()"
        />
      } @else if (games(); as list) {
        @if (list.length === 0) {
          <app-empty-state icon="playing_cards" title="No games yet" />
        } @else {
          <div class="games">
            <nav class="games__list" aria-label="Games">
              @for (game of list; track game.slug) {
                @let current = game.slug === selectedSlug();
                <button
                  type="button"
                  class="games__item"
                  [class.games__item--on]="current"
                  [attr.aria-current]="current || null"
                  [style.--game-accent]="accent(game.slug)"
                  (click)="select(game.slug)"
                >
                  <span class="games__dot" aria-hidden="true"></span>
                  <span class="games__names">
                    <span class="games__name">{{ game.name }}</span>
                    <span class="games__slug mono">{{ game.slug }} · #{{ game.sortOrder }}</span>
                  </span>
                  <span
                    class="games__status"
                    [class.games__status--hidden]="game.status === 'HIDDEN'"
                  >
                    {{ game.status === 'HIDDEN' ? 'Hidden' : 'Active' }}
                  </span>
                </button>
              }
            </nav>
            @if (selected(); as game) {
              <section class="admin-card games__editor" aria-labelledby="game-editor-title">
                <h2 id="game-editor-title">
                  {{ game.name }} <span class="games__slug mono">{{ game.slug }}</span>
                </h2>
                <app-game-editor
                  [game]="game"
                  [saving]="saving()"
                  [serverErrors]="serverErrors()"
                  (save)="save(game, $event)"
                />
              </section>
            }
          </div>
        }
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading games</span>
          <app-skeleton variant="list" lines="4" />
        </div>
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .games {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      gap: var(--spacing-5);
      align-items: start;
    }
    .games__list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
    }
    .games__item {
      --game-accent: var(--color-primary);
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-ink);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .games__item--on {
      border-color: var(--game-accent);
      background: color-mix(in srgb, var(--game-accent) 10%, var(--color-surface));
    }
    .games__dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--game-accent);
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
    .games__slug {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-regular);
    }
    .games__status {
      padding: 0 var(--spacing-2);
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--color-success) 16%, var(--color-surface));
      font-size: var(--font-size-xs);
    }
    .games__status--hidden {
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    @media (max-width: 959px) {
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
  private readonly snackBar = inject(MatSnackBar);
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

  protected readonly selectedSlug = computed(() => this.selected()?.slug ?? null);

  constructor() {
    void this.load();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected accent(slug: string | undefined): string {
    return `var(${gameInfo(slug ?? '').colorVar})`;
  }

  protected select(slug: string | undefined): void {
    this.serverErrors.set({});
    void this.router.navigate([], { queryParams: { game: slug }, replaceUrl: true });
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      const games = await firstValueFrom(
        this.api.listAdminGames('body', false, { context: silentErrors() }),
      );
      this.games.set(games ?? []);
    } catch (error) {
      this.error.set(toApiError(error));
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
      this.snackBar.open(`${updated.name} saved.`, 'OK', { duration: 4000 });
      void this.publicGames.load(true);
    } catch (error) {
      const apiError = toApiError(error);
      this.serverErrors.set(apiError.fieldErrors);
      this.snackBar.open(friendlyMessage(apiError), 'OK', { duration: 6000 });
    } finally {
      this.saving.set(false);
    }
  }
}
