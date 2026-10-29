import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
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
import type { PlatformRegion, PublicBinderSummary } from '@orenji/api-client';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { PAGE_SEARCH_ATTR } from '../../../core/keyboard/keyboard-shortcuts.service';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../../shared/ui/segmented/segmented.component';
import { BinderListStore } from '../data/binder-list.store';
import { BinderKind, SEARCH_TEXT_MAX, WHOLE_REGION, showsStateList } from '../data/search-url';
import { BinderRowComponent } from './binder-row.component';
import { StateListComponent } from './state-list.component';

/** The empty states of the list (spec 6.3). */
export function bindersEmptyText(
  kind: BinderKind,
  q: string,
  game: string,
  guest: boolean,
): string {
  if (q) {
    return guest
      ? 'Nothing matches. Try a deck or card name. Sign in to find collectors by name.'
      : 'Nothing matches. Try a deck name, a card name or a collector.';
  }
  return kind === 'deckcores'
    ? `No ${game} deck cores for sale here yet.`
    : `No public ${game} binders here yet.`;
}

/**
 * Search › Binders (spec 6.3, board W4): the field "Deck, binder or collector, like Yubel" (it
 * matches binder names, handles and deck cores' key cards), the state chip "Quebec ×" or a teal
 * "Pick on the map", the segmented "Binders | Deck cores", and either "Browse by state or
 * province" (no state, no text) or the rows with "Load more" and their empty states. Every list
 * is of the browsed region and game. A row opens its binder or deck core; hovering a row outlines
 * its province on the map and fetches nothing.
 */
@Component({
  selector: 'app-binders-pane',
  imports: [BinderRowComponent, SegmentedComponent, ShellIconComponent, StateListComponent],
  template: `
    <div class="bp">
      <label class="bp__field">
        <app-shell-icon class="bp__muted" name="search" [size]="18" />
        <input
          #field
          class="bp__input"
          type="search"
          autocomplete="off"
          data-page-search
          placeholder="Deck, binder or collector, like Yubel"
          aria-label="Search binders and deck cores: a deck, a binder or a collector"
          [attr.maxlength]="maxLength"
          [value]="q()"
          (input)="onInput(field.value)"
          (keydown.enter)="submit(field.value)"
        />
      </label>
      <div class="bp__filters">
        @if (state(); as code) {
          <button
            #chip
            type="button"
            class="bp__chip"
            data-testid="state-chip"
            [attr.aria-label]="'Showing ' + stateName() + '. Show the whole region'"
            (click)="clearState()"
          >
            {{ stateName() }}
            <app-shell-icon name="close" [size]="16" />
          </button>
        } @else {
          <button type="button" class="bp__pick" (click)="pickOnMap.emit()">Pick on the map</button>
        }
        <app-segmented
          class="bp__kind"
          label="Show"
          size="sm"
          [options]="kinds"
          [value]="kind()"
          (valueChange)="kindChange.emit($event)"
        />
      </div>

      <div class="bp__body">
        @if (stateList()) {
          <app-state-list
            [region]="region()"
            [counts]="counts()"
            [deckCores]="deckCores()"
            [total]="total()"
            [deckCoreTotal]="deckCoreTotal()"
            [home]="home()"
            [loading]="!region()"
            (picked)="pickState($event)"
            (highlight)="highlight.emit($event)"
          />
        } @else if (store.status() === 'error' && store.items().length === 0) {
          <div class="bp__state" role="alert">
            <p>Binders could not load.</p>
            <button type="button" class="bp__retry" (click)="store.retry()">Try again</button>
          </div>
        } @else if (store.status() === 'loading' && store.items().length === 0) {
          <div aria-busy="true">
            <span class="visually-hidden" role="status">Loading binders</span>
            @for (bone of [0, 1, 2, 3, 4, 5]; track bone) {
              <span class="bp__bone" aria-hidden="true"></span>
            }
          </div>
        } @else if (store.items().length === 0) {
          <p class="bp__empty" data-testid="binders-empty">{{ emptyText() }}</p>
          @if (store.otherMatches()) {
            <p class="bp__other" data-testid="binders-other-kind">
              {{ kind() === 'deckcores' ? 'Binders' : 'Deck cores' }} match ‘{{ q() }}’.
              <button
                type="button"
                class="bp__retry"
                (click)="kindChange.emit(kind() === 'deckcores' ? 'binders' : 'deckcores')"
              >
                Show {{ kind() === 'deckcores' ? 'binders' : 'deck cores' }}
              </button>
            </p>
          }
        } @else {
          <ul class="bp__rows" [attr.aria-label]="listLabel()">
            @for (binder of store.items(); track binder.id) {
              <li>
                <app-binder-row
                  [binder]="binder"
                  [own]="isOwn(binder)"
                  [active]="binder.id === openId()"
                  (opened)="opened.emit($event)"
                  (hovered)="highlight.emit($event)"
                />
              </li>
            }
          </ul>
          @if (store.hasMore()) {
            <button
              type="button"
              class="bp__more"
              [disabled]="store.status() === 'loading'"
              (click)="store.loadMore()"
            >
              {{ store.status() === 'loading' ? 'Loading…' : 'Load more' }}
            </button>
          }
          @if (store.status() === 'error') {
            <p class="bp__empty" role="alert">
              More binders could not load.
              <button type="button" class="bp__retry" (click)="store.retry()">Try again</button>
            </p>
          }
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .bp {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .bp__field {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 44px;
      padding: 0 14px;
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-input);
      background: var(--color-surface);
    }
    .bp__field:focus-within {
      border-color: var(--color-accent);
      box-shadow: 0 0 0 2px var(--color-focus-ring);
    }
    .bp__input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--color-ink);
      font: inherit;
    }
    .bp__muted {
      color: var(--color-text-muted);
    }
    .bp__filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .bp__chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 36px;
      padding: 0 12px 0 14px;
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .bp__pick,
    .bp__retry {
      padding: 0;
      border: 0;
      background: none;
      color: var(--color-accent);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .bp__body {
      outline: none;
    }
    .bp__rows {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0 -12px;
      padding: 0;
      list-style: none;
    }
    .bp__more {
      align-self: flex-start;
      min-height: 40px;
      margin-top: 12px;
      padding: 0 18px;
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-ink);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .bp__other {
      margin: 8px 0 0;
      font-size: var(--font-size-sm);
    }
    .bp__empty,
    .bp__state p {
      margin: 0;
      color: var(--color-text-muted);
    }
    .bp__state {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
    .bp__bone {
      display: block;
      height: 56px;
      margin: 8px 0;
      border-radius: var(--radius-row);
      background: var(--color-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BindersPaneComponent {
  protected readonly store = inject(BinderListStore);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly fieldRef = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly stateListRef = viewChild(StateListComponent);
  private readonly chipRef = viewChild<ElementRef<HTMLButtonElement>>('chip');
  private readonly announcer = inject(LiveAnnouncer);
  private readonly injector = inject(Injector);
  /**
   * Where the focus goes once a choice made in the pane rendered (spec 6.4: the list is the
   * keyboard and screen-reader twin of the map): the state chip after a pick, the state's row
   * after the chip's ×. A pick on the map leaves the focus on the map.
   */
  private pendingFocus: { to: 'chip' } | { to: 'row'; code: string | null } | null = null;
  /** The text whose results were last announced. */
  private announcedQuery: string | null = null;

  readonly regionCode = input.required<string>();
  readonly region = input<PlatformRegion | null>(null);
  readonly game = input.required<string>();
  readonly gameName = input('');
  readonly q = input('');
  readonly state = input<string | null>(null);
  readonly stateName = input('');
  readonly kind = input<BinderKind>('binders');
  readonly counts = input<ReadonlyMap<string, number>>(new Map());
  readonly deckCores = input<ReadonlyMap<string, number>>(new Map());
  readonly total = input(0);
  readonly deckCoreTotal = input(0);
  readonly home = input<string | null>(null);
  readonly openId = input<string | null>(null);
  readonly qChange = output<string>();
  readonly stateChange = output<string | null>();
  readonly kindChange = output<BinderKind>();
  readonly pickOnMap = output<void>();
  readonly highlight = output<string | null>();
  readonly opened = output<{ binder: PublicBinderSummary; opener: EventTarget | null }>();

  protected readonly maxLength = SEARCH_TEXT_MAX;
  protected readonly kinds: readonly SegmentOption<BinderKind>[] = [
    { value: 'binders', label: 'Binders' },
    { value: 'deckcores', label: 'Deck cores' },
  ];
  protected readonly stateList = computed(() =>
    showsStateList({ state: this.state(), q: this.q() }),
  );
  protected readonly emptyText = computed(() =>
    bindersEmptyText(this.kind(), this.q(), this.gameName(), !this.auth.isAuthenticated()),
  );
  protected readonly listLabel = computed(() =>
    this.kind() === 'deckcores' ? 'Deck cores' : 'Binders',
  );
  private readonly typed = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const query = {
        region: this.regionCode(),
        game: this.game(),
        state: this.state() === WHOLE_REGION ? null : this.state(),
        deckCores: this.kind() === 'deckcores',
        q: this.q(),
      };
      const list = this.stateList();
      untracked(() => (list ? this.store.clear() : this.store.load(query)));
    });
    // After a pick in the list or the chip's ×: the focus and a short announcement (no count).
    effect(() => {
      const state = this.state();
      this.stateName();
      untracked(() => {
        const pending = this.pendingFocus;
        if (!pending || (pending.to === 'chip') !== !!state) {
          return;
        }
        this.pendingFocus = null;
        this.announcer.announce(
          state
            ? `Showing ${state === WHOLE_REGION ? 'the whole region' : this.stateName()}`
            : 'Browse by state or province',
          'polite',
        );
        afterNextRender(
          {
            write: () => {
              if (pending.to === 'chip') {
                this.chipRef()?.nativeElement.focus();
              } else {
                this.stateListRef()?.focusCode(pending.code);
              }
            },
          },
          { injector: this.injector },
        );
      });
    });
    // A text search's results, said once they are in: "Results updated" or the no-match text.
    effect(() => {
      const q = this.q();
      const status = this.store.status();
      const count = this.store.items().length;
      untracked(() => {
        if (!q) {
          this.announcedQuery = null;
          return;
        }
        if (status === 'loading' || q === this.announcedQuery) {
          return;
        }
        this.announcedQuery = q;
        this.announcer.announce(
          status === 'error'
            ? 'Binders could not load.'
            : count === 0
              ? this.emptyText()
              : 'Results updated',
          'polite',
        );
      });
    });
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  /** A state (or "Whole region") chosen in the list: its rows, the focus on the chip. */
  protected pickState(code: string): void {
    this.pendingFocus = { to: 'chip' };
    this.stateChange.emit(code);
  }

  /** The chip's ×: back to the list, the focus on the state that was chosen. */
  protected clearState(): void {
    const state = this.state();
    this.pendingFocus = { to: 'row', code: state && state !== WHOLE_REGION ? state : WHOLE_REGION };
    this.stateChange.emit(null);
  }

  protected isOwn(binder: PublicBinderSummary): boolean {
    const me = this.session.me()?.id;
    return !!me && binder.owner?.id === me;
  }

  /** The text goes to the URL after a pause (300 ms), so Back keeps it. */
  protected onInput(value: string): void {
    this.typed.set(value);
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.qChange.emit(value.trim().slice(0, SEARCH_TEXT_MAX)), 300);
  }

  protected submit(value: string): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.qChange.emit(value.trim().slice(0, SEARCH_TEXT_MAX));
  }

  focusField(): void {
    this.fieldRef()?.nativeElement.focus();
  }

  /** "Skip the map": the state list's tab stop, else the first row. */
  focusList(): void {
    const list = this.stateListRef();
    if (list) {
      list.focus();
      return;
    }
    const field = this.fieldRef()?.nativeElement;
    const row = field?.closest('.bp')?.querySelector<HTMLElement>('[data-testid="binder-row"]');
    row?.focus();
  }

  protected readonly pageSearchAttr = PAGE_SEARCH_ATTR;
}
