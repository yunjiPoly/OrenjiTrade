import { Injectable, computed, inject, signal } from '@angular/core';
import { CatalogService, GameResponse, GameSchema } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../core/http/api-error';
import { silentErrors } from '../../core/http/http-context';
import { gameInfo } from '../domain/games';

/**
 * Supported games with their `GameSchema` (`GET /api/v1/games`: ACTIVE games in display order),
 * loaded once and shared by the catalog pages, filters and profile pickers. Hidden games are
 * absent, so they disappear from every picker as soon as an admin hides them.
 */
@Injectable({ providedIn: 'root' })
export class GamesStore {
  private readonly api = inject(CatalogService);
  private readonly gamesState = signal<GameResponse[] | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<ApiError | null>(null);
  private inflight: Promise<GameResponse[] | null> | null = null;

  /** `null` until the first answer. */
  readonly games = this.gamesState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  private readonly bySlugMap = computed(
    () => new Map((this.gamesState() ?? []).map((game) => [game.slug ?? '', game])),
  );

  /** Loads the games once (or again with `force`). Never rejects; `null` on failure. */
  load(force = false): Promise<GameResponse[] | null> {
    if (!force && this.gamesState()) {
      return Promise.resolve(this.gamesState());
    }
    if (this.inflight) {
      return this.inflight;
    }
    this.loadingState.set(true);
    this.errorState.set(null);
    const request = firstValueFrom(this.api.listGames('body', false, { context: silentErrors() }))
      .then((games) => {
        this.gamesState.set(games ?? []);
        return this.gamesState();
      })
      .catch((error: unknown) => {
        this.errorState.set(toApiError(error));
        return null;
      })
      .finally(() => {
        this.loadingState.set(false);
        this.inflight = null;
      });
    this.inflight = request;
    return request;
  }

  game(slug: string | null | undefined): GameResponse | null {
    return slug ? (this.bySlugMap().get(slug) ?? null) : null;
  }

  schema(slug: string | null | undefined): GameSchema | null {
    return this.game(slug)?.schema ?? null;
  }

  /** Short display name: the known brand label, else the API's short name, else the slug. */
  label(slug: string): string {
    const known = gameInfo(slug);
    if (known.label !== slug) {
      return known.shortLabel;
    }
    const game = this.game(slug);
    return game?.shortName || game?.name || slug;
  }
}
