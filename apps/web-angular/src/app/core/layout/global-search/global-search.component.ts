import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
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
import { ShellLayout } from '../shell-layout.service';
import {
  SEARCH_CARD_ROWS,
  SEARCH_COLLECTOR_ROWS,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_CHARS,
  SearchOption,
  exactCodeIndex,
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
    '(keydown)': 'onPanelKeydown($event)',
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
  protected readonly gameName = computed(() => this.game.info().shortLabel);
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
  protected readonly bindersOption = computed(() =>
    this.options().find((o) => o.kind === 'binders'),
  );
  protected readonly noCards = computed(
    () => this.status() === 'ready' && this.typing() && this.cardOptions().length === 0,
  );
  protected readonly activeId = computed(() => this.options()[this.active()]?.id ?? null);
  /**
   * What the dropdown says to screen readers (WCAG 4.1.3), through the CDK's one live region (it
   * exists before the text changes, so it is heard): "Searching…", that suggestions arrived (no
   * count) or that none match. The visible lines carry no role of their own.
   */
  protected readonly liveText = computed(() => {
    if (!this.open() || !this.typing()) {
      return '';
    }
    switch (this.status()) {
      case 'loading':
        return 'Searching…';
      case 'error':
        return 'Search is not available right now.';
      case 'ready':
        return this.noCards()
          ? `No ${this.gameName()} card matches ‘${this.trimmed()}’.`
          : 'Suggestions ready. Use the up and down arrows to move through them.';
      default:
        return '';
    }
  });
  protected readonly splitMatch = splitMatch;

  constructor() {
    const announcer = inject(LiveAnnouncer);
    effect(() => {
      const text = this.liveText();
      if (text) {
        untracked(() => void announcer.announce(text, 'polite'));
      }
    });
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
        // A typed printing code makes its row the active one, so Enter opens that printing
        // (spec 4.4); free text keeps no row active and Enter opens Search › Cards.
        this.active.set(exactCodeIndex(results.query, this.options()));
      });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
    // Take over the placeholder field this chunk replaced: its focus and what was typed.
    const handoff = inject(ShellLayout).searchHandoff;
    afterNextRender(() => {
      const field = this.input().nativeElement;
      if (handoff.text) {
        field.value = handoff.text;
        this.onInput(handoff.text);
      }
      if (handoff.focused) {
        field.focus();
      }
      handoff.focused = false;
      handoff.text = '';
    });
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
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      // Ctrl/Cmd+K in the field (after Esc closed the list): open it again. The shortcut itself
      // (select the text) runs at the document.
      this.open.set(true);
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) {
          // Esc closed the list: the first ArrowDown only opens it again.
          this.open.set(true);
          return;
        }
        if (!this.typing()) {
          this.recentRuns()[0]?.focus();
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
      // Tab walks on: into the panel's buttons and links when it has some (recent searches, the
      // Settings link), else to the next control; the list closes when the focus leaves the
      // search (onFocusOut). Closing it here dropped the focus onto <body>.
    }
  }

  /**
   * Keys inside the panel (the recent searches): ↑↓ move between the rows, ↑ from the first goes
   * back to the field, Esc closes and returns to the field (spec 4.9).
   */
  protected onPanelKeydown(event: KeyboardEvent): void {
    const field = this.input().nativeElement;
    if (event.target === field) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      // The field first (its focus opens the list), then close.
      field.focus();
      this.close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    const rows = this.recentRuns();
    const index = rows.indexOf(event.target as HTMLElement);
    if (index < 0) {
      return;
    }
    event.preventDefault();
    if (event.key === 'ArrowDown') {
      rows[Math.min(index + 1, rows.length - 1)].focus();
    } else if (index === 0) {
      field.focus();
    } else {
      rows[index - 1].focus();
    }
  }

  private recentRuns(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.gs__recent-run'));
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
}
