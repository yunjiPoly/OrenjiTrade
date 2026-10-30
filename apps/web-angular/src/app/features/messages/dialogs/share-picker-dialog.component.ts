import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import {
  BinderResponse,
  BindersService,
  CardSuggestion,
  CatalogService,
  InventoryItemResponse,
  InventoryService,
} from '@orenji/api-client';
import { Subject, Subscription, debounceTime, firstValueFrom } from 'rxjs';
import { silentErrors } from '../../../core/http/http-context';
import { uniqueSuggestions } from '../../../shared/catalog/card-suggestions';
import {
  QUERY_MAX_LENGTH,
  SUGGEST_LIMIT,
  SUGGEST_MIN_CHARS,
} from '../../../shared/catalog/catalog-constants';
import { gameInfo } from '../../../shared/domain/games';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { itemPriceText } from '../../inventory/data/item-price';
import { RouterLink } from '@angular/router';
import {
  type BinderLinkChoice,
  type CardLinkChoice,
  matchingBinders,
  printingForSuggestion,
} from '../../../shared/links/link-choices';
import { ROOM_SHARE_COPY } from '../../community/data/community-copy';
import { SHARE_COPY } from '../data/chat-copy';
import { DraftAttachment } from '../data/message-draft';

export interface SharePickerData {
  mode: 'card' | 'binder';
  /** The other collector's handle (a chat). */
  other: string;
  /**
   * A community room instead of a chat (web WF, board W22): your public cards and binders of the
   * room's game, chosen as a printing or a binder to share in a post; and below your cards, any
   * card of the catalogue (`GET /cards/suggest`), as the phone and the web before WF (review F1).
   */
  room?: { name: string; game: string | null };
}

/** What the picker chose in a chat: one of the caller's cards (it pins the chat) or a binder. */
export type ShareChoice = Extract<DraftAttachment, { kind: 'item' } | { kind: 'binder' }>;

/** What the picker chose in a room: a printing of one of your cards, or a binder or deck core. */
export type RoomShareChoice =
  | { kind: 'card'; card: CardLinkChoice }
  | { kind: 'binder'; binder: BinderLinkChoice; deckCore: boolean; price: string | null };

interface Row {
  id: string;
  name: string;
  line: string;
  price: string | null;
  imageUrl: string | null;
  game: string | null;
  core: boolean;
  choice: ShareChoice | RoomShareChoice;
}

const SEARCH_DEBOUNCE_MS = 250;
const CARDS_PAGE = 30;

/**
 * "Share a card from your inventory" and "Share a binder" (520, spec 10.3, board W20): a search
 * field and the caller's cards (newest first, `GET /inventory/items`) or public binders and deck
 * cores (`GET /binders`, effectively public only). Choosing a row closes the dialog with it; the
 * chat sends it at once (a card pins the chat's subject, stage R4). Skeleton, empty, no match and
 * an error with "Try again"; ↑↓ move between rows. In a room, "Share a card" also searches "All
 * cards" of the catalogue below your own (a "Looking for…" post shares a card you do not have).
 */
@Component({
  selector: 'app-share-picker-dialog',
  imports: [
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    CardImageComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="sp">
      <header class="sp__head">
        <div>
          <h2 class="sp__title" mat-dialog-title>{{ title }}</h2>
          <p class="sp__lead">{{ lead }}</p>
        </div>
        <button type="button" class="sp__close" aria-label="Close" mat-dialog-close>
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </header>
      <label class="sp__search">
        <mat-icon aria-hidden="true">search</mat-icon>
        <span class="visually-hidden">{{ placeholder }}</span>
        <input
          type="search"
          autocomplete="off"
          cdkFocusInitial
          [placeholder]="placeholder"
          [value]="query()"
          (input)="onQuery($event)"
          (keydown.arrowdown)="focusRow(0, $event)"
        />
      </label>

      <div class="sp__list" [attr.aria-busy]="status() === 'loading'">
        @switch (status()) {
          @case ('loading') {
            <div class="sp__pad"><app-skeleton variant="list" lines="5" /></div>
          }
          @case ('error') {
            <div class="sp__pad">
              <app-error-state compact [title]="errorTitle" (retry)="load()" />
            </div>
          }
          @default {
            @if (rows().length) {
              <ul class="sp__rows" [attr.aria-label]="title">
                @for (row of rows(); track row.id; let i = $index) {
                  <li>
                    <button
                      type="button"
                      class="sp__row"
                      [attr.data-row]="i"
                      [attr.aria-label]="rowLabel(row)"
                      (click)="pick(row)"
                      (keydown)="onRowKey($event, i)"
                    >
                      @if (isCards) {
                        <app-card-image
                          class="sp__art"
                          size="xs"
                          [src]="row.imageUrl"
                          [game]="row.game ?? ''"
                          alt=""
                        />
                      } @else {
                        <span
                          class="sp__binder"
                          [class.sp__binder--core]="row.core"
                          aria-hidden="true"
                        >
                          <mat-icon>{{ row.core ? 'style' : 'menu_book' }}</mat-icon>
                        </span>
                      }
                      <span class="sp__text">
                        <span class="sp__name">{{ row.name }}</span>
                        <span class="sp__line">{{ row.line }}</span>
                      </span>
                      @if (row.price) {
                        <span class="sp__price">{{ row.price }}</span>
                      }
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <div class="sp__empty-box">
                <p class="sp__empty" role="status">{{ emptyText() }}</p>
                @if (room && !query().trim()) {
                  <a
                    class="sp__add"
                    routerLink="/inventory"
                    [queryParams]="isCards ? { add: 'new' } : { tab: 'binders' }"
                    mat-dialog-close
                    >{{ isCards ? roomCopy.addCards : roomCopy.yourBinders }}</a
                  >
                }
              </div>
            }
          }
        }
        @if (searchAll) {
          <section
            class="sp__all"
            [attr.aria-labelledby]="allTitleId"
            data-testid="share-all-cards"
          >
            <h3 class="sp__group" [id]="allTitleId">{{ roomCopy.allCards }}</h3>
            @switch (allStatus()) {
              @case ('idle') {
                <p class="sp__hint">{{ roomCopy.allHint }}</p>
              }
              @case ('loading') {
                <div class="sp__pad" aria-busy="true">
                  <span class="visually-hidden">{{ roomCopy.allLoading }}</span>
                  <app-skeleton variant="list" lines="3" />
                </div>
              }
              @case ('error') {
                <div class="sp__pad">
                  <app-error-state
                    [title]="roomCopy.allError"
                    retryLabel="Try again"
                    (retry)="searchCatalogue()"
                  />
                </div>
              }
              @default {
                @if (allCards().length) {
                  <ul class="sp__rows" [attr.aria-labelledby]="allTitleId">
                    @for (card of allCards(); track suggestionKey(card); let i = $index) {
                      <li>
                        <button
                          type="button"
                          class="sp__row"
                          [attr.data-row]="rows().length + i"
                          [attr.aria-label]="
                            rowLabel({
                              name: card.name ?? '',
                              line: suggestionLine(card),
                              price: null,
                            })
                          "
                          [attr.aria-disabled]="resolving() ? 'true' : null"
                          (click)="pickSuggestion(card)"
                          (keydown)="onRowKey($event, rows().length + i)"
                        >
                          <app-card-image
                            class="sp__art"
                            size="xs"
                            [src]="card.imageUrl"
                            [game]="card.game ?? ''"
                            alt=""
                          />
                          <span class="sp__text">
                            <span class="sp__name">{{ card.name }}</span>
                            <span class="sp__line">{{ suggestionLine(card) }}</span>
                          </span>
                        </button>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="sp__hint">{{ roomCopy.allNoMatch(allQuery()) }}</p>
                }
              }
            }
            @if (resolveError(); as problem) {
              <p class="sp__problem" role="alert">{{ problem }}</p>
            }
            <p class="visually-hidden" aria-live="polite">{{ allAnnouncement() }}</p>
          </section>
        }
      </div>

      <footer class="sp__foot">
        <span>{{ foot }}</span>
        <button matButton="outlined" type="button" mat-dialog-close>{{ copy.cancel }}</button>
      </footer>
    </div>
  `,
  styles: `
    .sp {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      max-height: min(640px, calc(100dvh - 64px));
      padding: var(--spacing-6) var(--spacing-6) var(--spacing-4);
    }
    .sp__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-3);
    }
    .sp__title {
      margin: 0;
      padding: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
    }
    .sp__title::before {
      display: none;
    }
    .sp__lead {
      margin: var(--spacing-1) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .sp__close {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--color-ink);
      cursor: pointer;
    }
    .sp__close:focus-visible,
    .sp__row:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: -2px;
    }
    .sp__head,
    .sp__search,
    .sp__foot {
      flex: 0 0 auto;
    }
    .sp__empty-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding-bottom: 16px;
    }
    .sp__add {
      display: inline-flex;
      align-items: center;
      height: 36px;
      padding: 0 16px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .sp__search {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      height: 44px;
      padding: 0 var(--spacing-3);
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-input);
      background: var(--color-surface);
      color: var(--color-text-muted);
    }
    .sp__search:focus-within {
      border-color: var(--color-primary);
    }
    .sp__search input {
      flex: 1 1 auto;
      min-width: 0;
      border: 0;
      background: none;
      color: var(--color-ink);
      font: inherit;
      outline: none;
    }
    .sp__list {
      flex: 1 1 auto;
      min-height: 160px;
      overflow-y: auto;
    }
    .sp__pad {
      padding: var(--spacing-3) 0;
    }
    .sp__rows {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .sp__row {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      width: 100%;
      min-height: 64px;
      padding: var(--spacing-2);
      border: 0;
      border-radius: var(--radius-row);
      background: none;
      color: var(--color-ink);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .sp__row:hover {
      background: var(--color-surface-variant);
    }
    .sp__art {
      flex: 0 0 36px;
    }
    .sp__binder {
      display: grid;
      flex: 0 0 36px;
      place-items: center;
      width: 36px;
      height: 50px;
      border-radius: var(--radius-sm);
      background: var(--color-surface-variant);
      color: var(--color-text-secondary);
    }
    .sp__binder--core {
      background: var(--color-deck-core-tag-background);
      color: var(--color-deck-core-tag-text);
    }
    .sp__text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
    }
    .sp__name {
      overflow: hidden;
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp__line {
      color: var(--color-text-muted);
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
    }
    .sp__price {
      flex: 0 0 auto;
      font-weight: var(--font-weight-semibold);
    }
    .sp__empty {
      margin: 0;
      padding: var(--spacing-6) 0;
      color: var(--color-text-muted);
      text-align: center;
    }
    .sp__all {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
      margin-top: var(--spacing-2);
      padding-top: var(--spacing-3);
      border-top: 1px solid var(--color-border);
    }
    .sp__group {
      margin: 0;
      padding: 0 var(--spacing-2);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }
    .sp__hint {
      margin: 0;
      padding: var(--spacing-2);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .sp__problem {
      margin: 0;
      padding: var(--spacing-2);
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    .sp__foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-3);
      padding-top: var(--spacing-3);
      border-top: 1px solid var(--color-border);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharePickerDialogComponent {
  protected readonly data = inject<SharePickerData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<SharePickerDialogComponent, ShareChoice | RoomShareChoice>>(MatDialogRef);
  private readonly inventory = inject(InventoryService);
  private readonly binders = inject(BindersService);
  private readonly catalog = inject(CatalogService);
  private readonly document = inject(DOCUMENT);

  protected readonly copy = SHARE_COPY;
  protected readonly roomCopy = ROOM_SHARE_COPY;
  protected readonly room = this.data.room ?? null;
  protected readonly isCards = this.data.mode === 'card';
  protected readonly title = this.room
    ? this.isCards
      ? ROOM_SHARE_COPY.cardTitle
      : ROOM_SHARE_COPY.binderTitle
    : this.isCards
      ? SHARE_COPY.cardTitle
      : SHARE_COPY.binderTitle;
  protected readonly lead = this.room
    ? ROOM_SHARE_COPY.lead
    : this.isCards
      ? SHARE_COPY.cardBody(this.data.other)
      : SHARE_COPY.binderBody(this.data.other);
  protected readonly placeholder = this.room
    ? this.isCards
      ? ROOM_SHARE_COPY.cardSearch(this.room.name)
      : ROOM_SHARE_COPY.binderSearch(this.room.name)
    : this.isCards
      ? SHARE_COPY.cardSearch
      : SHARE_COPY.binderSearch;
  protected readonly foot = this.room
    ? this.isCards
      ? ROOM_SHARE_COPY.cardFoot
      : ROOM_SHARE_COPY.binderFoot
    : this.isCards
      ? SHARE_COPY.cardFoot
      : SHARE_COPY.binderFoot;
  protected readonly errorTitle = this.isCards ? SHARE_COPY.loadError : SHARE_COPY.binderLoadError;
  /** In a room, "Share a card" also searches every card of the catalogue (WF review F1). */
  protected readonly searchAll = !!this.room && this.isCards;
  protected readonly allTitleId = `sp-all-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly allStatus = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  protected readonly allCards = signal<CardSuggestion[]>([]);
  protected readonly allQuery = signal('');
  protected readonly resolving = signal(false);
  protected readonly resolveError = signal<string | null>(null);
  protected readonly allAnnouncement = computed(() => {
    if (this.allStatus() !== 'ready') {
      return '';
    }
    const count = this.allCards().length;
    return count
      ? `${count} ${count === 1 ? 'card' : 'cards'} found in all cards.`
      : ROOM_SHARE_COPY.allNoMatch(this.allQuery());
  });
  private suggestRequest: Subscription | null = null;

  protected readonly query = signal('');
  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly cards = signal<InventoryItemResponse[]>([]);
  private readonly allBinders = signal<BinderResponse[]>([]);
  private readonly typed = new Subject<string>();
  private request: Subscription | null = null;

  protected readonly rows = computed<Row[]>(() => {
    if (this.isCards) {
      return this.cards().map((item) => ({
        id: item.id,
        name: item.card.name,
        line: [printingCode(item.printing), item.binder?.name ?? ''].filter(Boolean).join(' · '),
        price: itemPriceText(item),
        imageUrl: printingImageUrl(item.printing),
        game: item.card.game ?? null,
        core: false,
        choice: this.room
          ? {
              kind: 'card',
              card: {
                printingId: item.printing.id ?? '',
                cardId: item.card.id,
                name: item.card.name,
                printingCode: printingCode(item.printing) || null,
                imageUrl: printingImageUrl(item.printing),
                game: item.card.game ?? null,
              },
            }
          : { kind: 'item', itemId: item.id, name: item.card.name },
      }));
    }
    const game = this.room?.game ?? null;
    // Public binders whose name matches without case or accents (the web's binder picker before
    // WF, removed with it).
    return matchingBinders(this.allBinders(), this.query())
      .filter((b) => !b.soldAt)
      .filter((b) => !game || !b.game || b.game === game)
      .map((b) => ({
        id: b.id,
        name: b.name,
        // In a room, the board's "Public binder · Yu-Gi-Oh!" (W22); in a chat, "Binder".
        line: this.room
          ? `${b.sellsAsCore ? SHARE_COPY.deckCore : ROOM_SHARE_COPY.publicBinder} · ${this.room.name}`
          : b.sellsAsCore
            ? SHARE_COPY.deckCore
            : SHARE_COPY.binder,
        price: b.sellsAsCore ? (b.askingPriceText?.trim() ?? null) : null,
        imageUrl: null,
        game: b.game ?? null,
        core: !!b.sellsAsCore,
        choice: this.room
          ? {
              kind: 'binder',
              binder: { binderId: b.id, name: b.name, itemCount: b.itemCount },
              deckCore: !!b.sellsAsCore,
              price: b.sellsAsCore ? (b.askingPriceText?.trim() ?? null) : null,
            }
          : {
              kind: 'binder',
              binder: { binderId: b.id, name: b.name, itemCount: b.itemCount },
            },
      }));
  });

  protected readonly emptyText = computed(() => {
    const q = this.query().trim();
    const room = this.room;
    if (room) {
      if (q) {
        return this.isCards
          ? ROOM_SHARE_COPY.cardNoMatch(room.name, q)
          : ROOM_SHARE_COPY.binderNoMatch(room.name, q);
      }
      return this.isCards
        ? ROOM_SHARE_COPY.cardEmpty(room.name)
        : ROOM_SHARE_COPY.binderEmpty(room.name);
    }
    if (q) {
      return this.isCards ? SHARE_COPY.cardNoMatch(q) : SHARE_COPY.binderNoMatch(q);
    }
    return this.isCards ? SHARE_COPY.cardEmpty : SHARE_COPY.binderEmpty;
  });

  constructor() {
    const typing = this.typed.pipe(debounceTime(SEARCH_DEBOUNCE_MS)).subscribe(() => {
      if (this.isCards) {
        this.load();
      }
      if (this.searchAll) {
        this.searchCatalogue();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      typing.unsubscribe();
      this.request?.unsubscribe();
      this.suggestRequest?.unsubscribe();
    });
    this.load();
  }

  load(): void {
    this.request?.unsubscribe();
    this.status.set('loading');
    if (this.isCards) {
      const query = this.query().trim() || undefined;
      this.request = this.inventory
        .listInventoryItems(
          this.room
            ? {
                query,
                game: this.room.game ?? undefined,
                markedPublic: true,
                sort: 'updated',
                direction: 'desc',
                size: CARDS_PAGE,
              }
            : { query, sort: 'updated', direction: 'desc', size: CARDS_PAGE },
          'body',
          false,
          { context: silentErrors() },
        )
        .subscribe({
          next: (page) => {
            this.cards.set(page.items ?? []);
            this.status.set('ready');
          },
          error: () => this.status.set('error'),
        });
      return;
    }
    this.request = this.binders
      .listMyBinders('body', false, { context: silentErrors() })
      .subscribe({
        next: (binders) => {
          this.allBinders.set(binders);
          this.status.set('ready');
        },
        error: () => this.status.set('error'),
      });
  }

  /** "All cards": the catalogue's suggestions for two letters or more (`GET /cards/suggest`). */
  protected searchCatalogue(): void {
    const q = this.query().trim().slice(0, QUERY_MAX_LENGTH);
    this.suggestRequest?.unsubscribe();
    this.resolveError.set(null);
    if (q.length < SUGGEST_MIN_CHARS) {
      this.allCards.set([]);
      this.allStatus.set('idle');
      return;
    }
    this.allStatus.set('loading');
    this.suggestRequest = this.catalog
      .suggestCards({ q, limit: SUGGEST_LIMIT }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (items) => {
          this.allCards.set(uniqueSuggestions(items ?? []));
          this.allQuery.set(q);
          this.allStatus.set('ready');
        },
        error: () => {
          this.allCards.set([]);
          this.allQuery.set(q);
          this.allStatus.set('error');
        },
      });
  }

  /**
   * A catalogue card chosen: its printing (a card suggestion resolves to the printing with the
   * suggested code through `GET /cards/{id}`), shared as the card of the post.
   */
  protected async pickSuggestion(suggestion: CardSuggestion): Promise<void> {
    if (this.resolving() || !suggestion.id) {
      return;
    }
    this.resolveError.set(null);
    let printingId = printingForSuggestion(suggestion, null);
    if (!printingId) {
      this.resolving.set(true);
      try {
        const card = await firstValueFrom(
          this.catalog.getCard({ id: suggestion.id }, 'body', false, { context: silentErrors() }),
        );
        printingId = printingForSuggestion(suggestion, card);
      } catch {
        printingId = null;
      } finally {
        this.resolving.set(false);
      }
    }
    if (!printingId) {
      this.resolveError.set(ROOM_SHARE_COPY.cannotShare);
      return;
    }
    const choice: RoomShareChoice = {
      kind: 'card',
      card: {
        printingId,
        cardId: suggestion.id,
        name: suggestion.name ?? 'Card',
        printingCode: suggestion.printingCode ?? null,
        imageUrl: suggestion.imageUrl ?? null,
        game: suggestion.game ?? null,
      },
    };
    this.ref.close(choice);
  }

  /** "Yu-Gi-Oh! · LOB-001": the game and the printing code of a catalogue card. */
  protected suggestionLine(suggestion: CardSuggestion): string {
    return [suggestion.game ? gameInfo(suggestion.game).shortLabel : '', suggestion.printingCode]
      .filter(Boolean)
      .join(' · ');
  }

  protected suggestionKey(suggestion: CardSuggestion): string {
    return `${suggestion.kind}:${suggestion.id}:${suggestion.printingId ?? ''}`;
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.typed.next(this.query());
  }

  protected pick(row: Row): void {
    this.ref.close(row.choice);
  }

  protected focusRow(index: number, event?: Event): void {
    const button = this.document.querySelector<HTMLButtonElement>(`.sp__row[data-row="${index}"]`);
    if (button) {
      event?.preventDefault();
      button.focus();
    }
  }

  protected onRowKey(event: KeyboardEvent, index: number): void {
    if (event.key === 'ArrowDown') {
      this.focusRow(index + 1, event);
    } else if (event.key === 'ArrowUp') {
      if (index === 0) {
        event.preventDefault();
        this.document.querySelector<HTMLInputElement>('.sp__search input')?.focus();
      } else {
        this.focusRow(index - 1, event);
      }
    }
  }

  /**
   * The row's visible words in their order, the price included (WCAG 2.5.3; the list is named by
   * the picker's title, "Share a card from your inventory"; WC review A7).
   */
  protected rowLabel(row: Pick<Row, 'name' | 'line' | 'price'>): string {
    return [row.name, row.line, row.price].filter(Boolean).join(', ');
  }
}
