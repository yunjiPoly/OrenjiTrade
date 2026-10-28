import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CatalogService, SearchService } from '@orenji/api-client';
import type { CardSuggestion, CollectorByName } from '@orenji/api-client';
import { Subject, catchError, debounceTime, forkJoin, map, of, switchMap } from 'rxjs';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { SessionService } from '../../auth/session.service';
import { GameContext } from '../../game/game-context.service';
import { silentErrors } from '../../http/http-context';
import { GLOBAL_SEARCH_ID } from '../../keyboard/keyboard-shortcuts.service';
import { RegionContext } from '../../region/region-context.service';
import { RecentSearches } from '../../search/recent-searches.service';
import { ShellIconComponent } from '../shell-icon/shell-icon.component';
import {
  SEARCH_CARD_ROWS,
  SEARCH_COLLECTOR_ROWS,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_CHARS,
  SearchOption,
  searchOptions,
  splitMatch,
} from './global-search.model';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface Results {
  query: string;
  cards: CardSuggestion[];
  collectors: CollectorByName[];
  failed: boolean;
}

/**
 * The top bar's search (spec 4.3 and 4.4, board W3): a 400 field (320 at md) with "/" and
 * Ctrl/Cmd+K, and a 560 dropdown. Empty, it lists the recent searches of this browser ("Clear",
 * remove buttons, the footnote); typing (150 ms, from 2 characters) lists up to 8 cards of the
 * browsed game (`GET /cards/suggest`), for a signed-in collector up to 3 collectors of the browsed
 * region (`GET /search/collectors`), and "Search binders and deck cores for '…'". No counts of any
 * kind. An ARIA combobox: ↑↓ move, Enter opens, Ctrl/Cmd+Enter or a middle click opens a new tab,
 * Esc closes. A deferred chunk of the top bar.
 */
@Component({
  selector: 'app-global-search',
  imports: [RouterLink, ShellIconComponent, CardImageComponent, AvatarComponent],
  templateUrl: './global-search.component.html',
  styleUrl: './global-search.component.scss',
  host: {
    '(focusout)': 'onFocusOut($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalSearchComponent {
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogService);
  private readonly search = inject(SearchService);
  private readonly session = inject(SessionService);
  private readonly region = inject(RegionContext);
  private readonly game = inject(GameContext);
  protected readonly recent = inject(RecentSearches);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly inputId = GLOBAL_SEARCH_ID;
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  protected readonly status = signal<Status>('idle');
  private readonly results = signal<Results | null>(null);
  private readonly typed$ = new Subject<string>();

  protected readonly signedIn = computed(() => this.session.status() === 'ready');
  protected readonly gameName = computed(() => this.game.info().label);
  protected readonly placeholder = computed(() =>
    this.signedIn()
      ? `Search ${this.gameName()} cards or collectors`
      : `Search ${this.gameName()} cards`,
  );
  protected readonly trimmed = computed(() => this.query().trim());
  protected readonly typing = computed(() => this.trimmed().length >= SEARCH_MIN_CHARS);
  protected readonly options = computed<SearchOption[]>(() => {
    const results = this.results();
    if (!this.typing() || !results || results.query !== this.trimmed()) {
      return [];
    }
    return searchOptions(results.query, results.cards, this.signedIn() ? results.collectors : []);
  });
  protected readonly cardOptions = computed(() => this.options().filter((o) => o.kind === 'card'));
  protected readonly collectorOptions = computed(() =>
    this.options().filter((o) => o.kind === 'collector'),
  );
  protected readonly bindersOption = computed(() => this.options().find((o) => o.kind === 'binders'));
  protected readonly noCards = computed(
    () => this.status() === 'ready' && this.typing() && this.cardOptions().length === 0,
  );
  protected readonly activeId = computed(() => this.options()[this.active()]?.id ?? null);
  protected readonly splitMatch = splitMatch;

  constructor() {
    const subscription = this.typed$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        switchMap((query) => this.fetch(query)),
      )
      .subscribe((results) => {
        if (results.query !== this.trimmed()) {
          return;
        }
        this.results.set(results);
        this.status.set(results.failed ? 'error' : 'ready');
        this.active.set(-1);
      });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.open.set(true);
    this.active.set(-1);
    const query = value.trim();
    if (query.length >= SEARCH_MIN_CHARS) {
      this.status.set('loading');
      this.typed$.next(query);
    } else {
      this.status.set('idle');
      this.results.set(null);
    }
  }

  protected retry(): void {
    if (this.typing()) {
      this.status.set('loading');
      this.typed$.next(this.trimmed());
    }
    this.input().nativeElement.focus();
  }

  protected onFocus(): void {
    this.open.set(true);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open.set(true);
        if (!this.typing()) {
          this.host.nativeElement.querySelector<HTMLElement>('.gs__recent-run')?.focus();
          return;
        }
        if (count > 0) {
          this.active.set((this.active() + 1) % count);
          this.scrollActive();
        }
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (count > 0) {
          this.active.set(this.active() <= 0 ? count - 1 : this.active() - 1);
          this.scrollActive();
        }
        return;
      case 'Enter': {
        event.preventDefault();
        const option = this.options()[this.active()];
        const newTab = event.ctrlKey || event.metaKey;
        if (option) {
          this.openOption(option, newTab);
        } else if (this.trimmed()) {
          this.go(['/search'], { tab: 'cards', q: this.trimmed() }, newTab);
        }
        return;
      }
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        }
        return;
      case 'Tab':
        this.close();
        return;
    }
  }

  /** A primary click on an option opens it in this tab; modified clicks keep the browser's way. */
  protected onOptionClick(event: MouseEvent, option: SearchOption): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      this.recent.remember(this.trimmed());
      return;
    }
    event.preventDefault();
    this.openOption(option, false);
  }

  protected runRecent(text: string): void {
    this.input().nativeElement.value = text;
    this.onInput(text);
    this.input().nativeElement.focus();
  }

  protected removeRecent(text: string): void {
    this.recent.forget(text);
    this.input().nativeElement.focus();
  }

  protected clearRecent(): void {
    this.recent.clear();
    this.input().nativeElement.focus();
  }

  protected clearField(): void {
    this.input().nativeElement.value = '';
    this.onInput('');
    this.input().nativeElement.focus();
  }

  /** Closes the dropdown when the focus leaves the field and its panel. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !this.host.nativeElement.contains(next)) {
      this.open.set(false);
      this.active.set(-1);
    }
  }

  protected href(option: SearchOption): string {
    return this.router.serializeUrl(
      this.router.createUrlTree(option.commands, { queryParams: option.queryParams }),
    );
  }

  private openOption(option: SearchOption, newTab: boolean): void {
    this.go(option.commands, option.queryParams, newTab);
  }

  private go(commands: unknown[], queryParams: Record<string, string>, newTab: boolean): void {
    this.recent.remember(this.trimmed());
    if (newTab) {
      const url = this.router.serializeUrl(this.router.createUrlTree(commands, { queryParams }));
      this.host.nativeElement.ownerDocument.defaultView?.open(url, '_blank', 'noopener');
      return;
    }
    this.close();
    this.input().nativeElement.value = '';
    this.query.set('');
    this.results.set(null);
    this.status.set('idle');
    this.input().nativeElement.blur();
    void this.router.navigate(commands, { queryParams });
  }

  private close(): void {
    this.open.set(false);
    this.active.set(-1);
  }

  private scrollActive(): void {
    const id = this.activeId();
    if (id) {
      queueMicrotask(() =>
        this.host.nativeElement.querySelector(`#${id}`)?.scrollIntoView({ block: 'nearest' }),
      );
    }
  }

  private fetch(query: string) {
    const game = this.game.current();
    const cards$ = this.catalog
      .suggestCards({ q: query, game, limit: SEARCH_CARD_ROWS + 4 }, 'body', false, {
        context: silentErrors(),
      })
      .pipe(map((cards) => ({ cards, failed: false })));
    // Collectors only for a signed-in collector: a guest never sees who (stage R15).
    const collectors$ = this.signedIn()
      ? this.search
          .searchCollectorsByName(
            { q: query, region: this.region.current(), limit: SEARCH_COLLECTOR_ROWS, game },
            'body',
            false,
            { context: silentErrors() },
          )
          .pipe(catchError(() => of([] as CollectorByName[])))
      : of([] as CollectorByName[]);
    return forkJoin([cards$.pipe(catchError(() => of({ cards: [] as CardSuggestion[], failed: true }))), collectors$]).pipe(
      map(([cards, collectors]) => ({ query, cards: cards.cards, collectors, failed: cards.failed })),
    );
  }
}
