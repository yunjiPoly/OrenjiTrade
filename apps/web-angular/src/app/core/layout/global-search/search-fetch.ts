import type { CatalogService, SearchService } from '@orenji/api-client';
import type { CardSuggestion, CollectorByName } from '@orenji/api-client';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { silentErrors } from '../../http/http-context';
import { SEARCH_CARD_ROWS, SEARCH_COLLECTOR_ROWS, SearchResults } from './global-search.model';

/**
 * The suggestions of one query (spec 4.4 and 6.2): up to 8 cards of the browsed game
 * (`GET /cards/suggest`, a few more asked for the code rows) and, for a member only, up to 3
 * collectors of the browsed region (`GET /search/collectors`; a guest never sees who, R15). The
 * top bar's search and Search › Cards read the same.
 */
export function fetchSuggestions(
  catalog: CatalogService,
  search: SearchService,
  input: { query: string; game: string; region: string; signedIn: boolean },
): Observable<SearchResults> {
  const { query, game, region, signedIn } = input;
  const cards$ = catalog
    .suggestCards({ q: query, game, limit: SEARCH_CARD_ROWS + 4 }, 'body', false, {
      context: silentErrors(),
    })
    .pipe(map((cards) => ({ cards, failed: false })));
  const collectors$ = signedIn
    ? search
        .searchCollectorsByName(
          { q: query, region, limit: SEARCH_COLLECTOR_ROWS, game },
          'body',
          false,
          { context: silentErrors() },
        )
        .pipe(catchError(() => of([] as CollectorByName[])))
    : of([] as CollectorByName[]);
  return forkJoin([
    cards$.pipe(catchError(() => of({ cards: [] as CardSuggestion[], failed: true }))),
    collectors$,
  ]).pipe(
    map(([cards, collectors]) => ({
      query,
      cards: cards.cards,
      collectors,
      failed: cards.failed,
    })),
  );
}
