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
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CatalogService, SearchService } from '@orenji/api-client';
import { Subject, debounceTime, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_CHARS,
  SearchOption,
  SearchResults,
  exactCodeIndex,
  searchOptions,
  splitMatch,
} from '../../../core/layout/global-search/global-search.model';
import { fetchSuggestions } from '../../../core/layout/global-search/search-fetch';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { RecentSearches } from '../../../core/search/recent-searches.service';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { SEARCH_TEXT_MAX } from '../data/search-url';
import { SetCardsComponent } from './set-cards.component';

type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Search › Cards (spec 6.2, board W4): the field "Card name or code, like LOB-EN001" (44, focused
 * on arrival); empty, the recent searches of this browser and "Pick a state on the map to see its
 * binders."; typing (150 ms, from 2 characters), the same results as the top bar's dropdown at the
 * pane's height: the browsed game's cards (picture and name, the match in orange, a code chip), a
 * member's collectors (3 at most), and "Search binders and deck cores for '…'". Enter or a click
 * opens the card page. An ARIA combobox and listbox with `aria-activedescendant`; no counts.
 */
@Component({
  selector: 'app-cards-pane',
  imports: [RouterLink, AvatarComponent, CardImageComponent, SetCardsComponent, ShellIconComponent],
  template: `
    <div class="cp">
      <div class="cp__field">
        <app-shell-icon class="cp__muted" name="search" [size]="18" />
        <input
          #field
          class="cp__input"
          type="search"
          role="combobox"
          autocomplete="off"
          spellcheck="false"
          data-page-search
          aria-autocomplete="list"
          aria-controls="cards-pane-list"
          [placeholder]="set() ? 'Card name in this set' : 'Card name or code, like LOB-EN001'"
          [attr.aria-label]="
            set()
              ? 'Search the cards of this set'
              : 'Search ' + gameName() + ' cards by name or code'
          "
          [attr.aria-expanded]="typing() && !set()"
          [attr.aria-activedescendant]="activeId()"
          [attr.maxlength]="maxLength"
          [value]="q()"
          (input)="onInput(field.value)"
          (keydown)="onKeydown($event)"
        />
        @if (query()) {
          <button type="button" class="cp__clear" aria-label="Clear the search" (click)="clear()">
            <app-shell-icon name="close" [size]="16" />
          </button>
        }
      </div>

      @if (set(); as setId) {
        <app-set-cards
          [setId]="setId"
          [game]="game()"
          [gameName]="gameName()"
          [q]="q()"
          (cleared)="setCleared.emit()"
        />
      } @else if (!typing()) {
        @if (recent.remembering() && recent.list().length > 0) {
          <section class="cp__section" aria-labelledby="cards-pane-recent">
            <div class="cp__head">
              <h2 class="cp__label" id="cards-pane-recent">Recent searches</h2>
              <button type="button" class="cp__text-action" (click)="recent.clear()">Clear</button>
            </div>
            <ul class="cp__recent">
              @for (text of recent.list(); track text) {
                <li class="cp__recent-row">
                  <button type="button" class="cp__recent-run" (click)="run(text)">
                    <app-shell-icon class="cp__muted" name="clock" [size]="18" />
                    <span>{{ text }}</span>
                  </button>
                  <button
                    type="button"
                    class="cp__remove"
                    [attr.aria-label]="'Remove ' + text + ' from recent searches'"
                    (click)="recent.forget(text)"
                  >
                    <app-shell-icon name="close" [size]="16" />
                  </button>
                </li>
              }
            </ul>
            <p class="cp__note">Only you see your searches. They're kept in this browser.</p>
          </section>
        }
        <p class="cp__quiet">Pick a state on the map to see its binders.</p>
        <p class="cp__quiet">
          Or
          <a class="cp__link" routerLink="/cards" data-testid="browse-catalog"
            >browse the catalog</a
          >
          by set and rarity.
        </p>
      } @else {
        <p class="cp__label cp__label--group" aria-hidden="true">{{ gameName() }} cards</p>
        @if (status() === 'loading' && cardOptions().length === 0) {
          @for (bone of [0, 1, 2, 3]; track bone) {
            <div class="cp__bone" aria-hidden="true"><span></span><span></span></div>
          }
        } @else if (status() === 'error') {
          <div class="cp__error" role="alert">
            <span>Search is not available right now.</span>
            <button type="button" class="cp__text-action" (click)="retry()">Try again</button>
          </div>
        } @else if (noCards()) {
          <div class="cp__nomatch">
            <p class="cp__nomatch-title">No {{ gameName() }} card matches ‘{{ trimmed() }}’</p>
            <p class="cp__nomatch-text">
              Try fewer letters, or the code printed on the card, like LAVD-EN008. Or
              <a class="cp__link" routerLink="/cards">browse the catalog</a>.
            </p>
          </div>
        }
        <div class="cp__results" role="listbox" id="cards-pane-list" aria-label="Search results">
          <div role="group" [attr.aria-label]="gameName() + ' cards'">
            @for (option of cardOptions(); track option.id) {
              @if (option.kind === 'card') {
                @let name = splitMatch(option.card.name ?? '', trimmed());
                <a
                  class="cp__option cp__option--card"
                  role="option"
                  tabindex="-1"
                  [id]="'cp-' + option.id"
                  [attr.aria-selected]="activeId() === 'cp-' + option.id"
                  [class.cp__option--active]="activeId() === 'cp-' + option.id"
                  [routerLink]="option.commands"
                  [queryParams]="option.queryParams"
                  [attr.aria-label]="
                    option.card.kind === 'PRINTING' && option.card.printingCode
                      ? option.card.name + ', ' + option.card.printingCode
                      : option.card.name
                  "
                  (click)="remember()"
                  (mousedown)="$event.preventDefault()"
                >
                  <app-card-image
                    class="cp__art"
                    [src]="option.card.imageUrl"
                    [game]="option.card.game"
                    alt=""
                  />
                  <span class="cp__name"
                    >{{ name.pre }}<mark class="cp__hit">{{ name.hit }}</mark
                    >{{ name.post }}</span
                  >
                  @if (option.card.kind === 'PRINTING' && option.card.printingCode) {
                    <span class="cp__code">{{ option.card.printingCode }}</span>
                  }
                </a>
              }
            }
          </div>
          @if (collectorOptions().length > 0) {
            <div role="group" aria-label="Collectors">
              <p class="cp__label cp__label--group" aria-hidden="true">Collectors</p>
              @for (option of collectorOptions(); track option.id) {
                @if (option.kind === 'collector') {
                  <a
                    class="cp__option cp__option--person"
                    role="option"
                    tabindex="-1"
                    [id]="'cp-' + option.id"
                    [attr.aria-selected]="activeId() === 'cp-' + option.id"
                    [class.cp__option--active]="activeId() === 'cp-' + option.id"
                    [routerLink]="option.commands"
                    [attr.aria-label]="
                      option.collector.handle + ', ' + option.collector.place.subdivisionName
                    "
                    (click)="remember()"
                    (mousedown)="$event.preventDefault()"
                  >
                    <app-avatar
                      size="xs"
                      [src]="option.collector.avatarUrl"
                      [name]="option.collector.displayName"
                      [decorative]="true"
                    />
                    <span class="cp__handle">{{ option.collector.handle }}</span>
                    <span class="cp__meta">{{ option.collector.place.subdivisionName }}</span>
                  </a>
                }
              }
            </div>
          }
          @if (bindersOption(); as option) {
            <a
              class="cp__option cp__option--binders"
              role="option"
              tabindex="-1"
              [id]="'cp-' + option.id"
              [attr.aria-selected]="activeId() === 'cp-' + option.id"
              [class.cp__option--active]="activeId() === 'cp-' + option.id"
              [routerLink]="option.commands"
              [queryParams]="option.queryParams"
              (click)="remember()"
              (mousedown)="$event.preventDefault()"
            >
              <app-shell-icon class="cp__muted" name="binder" [size]="20" />
              <span class="cp__binders">Search binders and deck cores for ‘{{ trimmed() }}’</span>
              <app-shell-icon class="cp__muted" name="arrowRight" [size]="18" />
            </a>
          }
        </div>
      }
    </div>
  `,
  styleUrl: './cards-pane.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardsPaneComponent {
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogService);
  private readonly search = inject(SearchService);
  private readonly auth = inject(AuthService);
  protected readonly recent = inject(RecentSearches);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  readonly q = input('');
  readonly game = input.required<string>();
  readonly gameName = input('');
  readonly region = input.required<string>();
  /** The cards of one set (`?set=`, a set page's "Who has cards of this set"). */
  readonly set = input<string | null>(null);
  /** The text goes to the URL (`?q=`), so Back and a reload keep it. */
  readonly qChange = output<string>();
  /** The set chip's ×: every card again. */
  readonly setCleared = output<void>();

  protected readonly maxLength = SEARCH_TEXT_MAX;
  protected readonly splitMatch = splitMatch;
  protected readonly query = signal('');
  protected readonly status = signal<Status>('idle');
  protected readonly active = signal(-1);
  private readonly results = signal<SearchResults | null>(null);
  private readonly typed$ = new Subject<string>();
  private urlTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly trimmed = computed(() => this.query().trim());
  protected readonly typing = computed(() => this.trimmed().length >= SEARCH_MIN_CHARS);
  private readonly signedIn = computed(() => this.auth.isAuthenticated());
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
  protected readonly activeId = computed(() => {
    const option = this.options()[this.active()];
    return option ? `cp-${option.id}` : null;
  });

  constructor() {
    const announcer = inject(LiveAnnouncer);
    const subscription = this.typed$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        switchMap((query) =>
          fetchSuggestions(this.catalog, this.search, {
            query,
            game: this.game(),
            region: this.region(),
            signedIn: this.signedIn(),
          }),
        ),
      )
      .subscribe((results) => {
        if (results.query !== this.trimmed()) {
          return;
        }
        this.results.set(results);
        this.status.set(results.failed ? 'error' : 'ready');
        this.active.set(exactCodeIndex(results.query, this.options()));
        void announcer.announce(
          results.failed
            ? 'Search is not available right now.'
            : this.noCards()
              ? `No ${this.gameName()} card matches ‘${results.query}’.`
              : 'Results ready. Use the up and down arrows to move through them.',
          'polite',
        );
      });
    // The URL's text (a reload, Back, the top bar's Enter) fills the field.
    effect(() => {
      const q = this.q();
      untracked(() => {
        if (q !== this.query()) {
          this.query.set(q);
          if (this.field()) {
            this.field().nativeElement.value = q;
          }
          this.start(q);
        }
      });
    });
    // The game changed: the same text, the new game's cards.
    effect(() => {
      this.game();
      untracked(() => this.start(this.query()));
    });
    afterNextRender(() => this.field().nativeElement.focus());
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      if (this.urlTimer) {
        clearTimeout(this.urlTimer);
      }
    });
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.start(value);
    if (this.urlTimer) {
      clearTimeout(this.urlTimer);
    }
    this.urlTimer = setTimeout(
      () => this.qChange.emit(value.trim().slice(0, SEARCH_TEXT_MAX)),
      400,
    );
  }

  private start(value: string): void {
    this.active.set(-1);
    const query = value.trim();
    // On one set's cards the field filters that list (no dropdown of suggestions).
    if (query.length >= SEARCH_MIN_CHARS && !this.set()) {
      this.status.set('loading');
      this.typed$.next(query);
    } else {
      this.status.set('idle');
      this.results.set(null);
    }
  }

  protected retry(): void {
    this.start(this.query());
    this.field().nativeElement.focus();
  }

  protected clear(): void {
    this.field().nativeElement.value = '';
    this.onInput('');
    this.field().nativeElement.focus();
  }

  protected run(text: string): void {
    this.field().nativeElement.value = text;
    this.onInput(text);
    this.field().nativeElement.focus();
  }

  protected remember(): void {
    this.recent.remember(this.trimmed());
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
        if (count > 0) {
          event.preventDefault();
          this.active.set((this.active() + 1) % count);
          this.scrollActive();
        }
        return;
      case 'ArrowUp':
        if (count > 0) {
          event.preventDefault();
          this.active.set(this.active() <= 0 ? count - 1 : this.active() - 1);
          this.scrollActive();
        }
        return;
      case 'Enter': {
        event.preventDefault();
        // The active row, else the first card (spec 6.2: Enter opens the card page).
        const option = this.options()[this.active()] ?? this.cardOptions()[0];
        if (!option) {
          return;
        }
        this.remember();
        const newTab = event.ctrlKey || event.metaKey;
        const tree = this.router.createUrlTree(option.commands, {
          queryParams: option.queryParams,
        });
        if (newTab) {
          this.host.nativeElement.ownerDocument.defaultView?.open(
            this.router.serializeUrl(tree),
            '_blank',
            'noopener',
          );
          return;
        }
        void this.router.navigateByUrl(tree);
        return;
      }
      case 'Escape':
        // With text, the browser clears the field (it stays the field's Esc).
        if (this.active() >= 0) {
          event.preventDefault();
          this.active.set(-1);
        }
        return;
    }
  }

  focusField(): void {
    this.field().nativeElement.focus();
  }

  private scrollActive(): void {
    const id = this.activeId();
    if (id) {
      queueMicrotask(() =>
        this.host.nativeElement.querySelector(`#${id}`)?.scrollIntoView({ block: 'nearest' }),
      );
    }
  }
}
