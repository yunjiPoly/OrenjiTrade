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
  InventoryItemResponse,
  InventoryService,
} from '@orenji/api-client';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { silentErrors } from '../../../core/http/http-context';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { itemPriceText } from '../../inventory/data/item-price';
import { SHARE_COPY } from '../data/chat-copy';
import { DraftAttachment } from '../data/message-draft';

export interface SharePickerData {
  mode: 'card' | 'binder';
  /** The other collector's handle. */
  other: string;
}

/** What the picker chose: one of the caller's cards (it pins the chat) or a public binder. */
export type ShareChoice = Extract<DraftAttachment, { kind: 'item' } | { kind: 'binder' }>;

interface Row {
  id: string;
  name: string;
  line: string;
  price: string | null;
  imageUrl: string | null;
  game: string | null;
  core: boolean;
  choice: ShareChoice;
}

const SEARCH_DEBOUNCE_MS = 250;
const CARDS_PAGE = 30;

/**
 * "Share a card from your inventory" and "Share a binder" (520, spec 10.3, board W20): a search
 * field and the caller's cards (newest first, `GET /inventory/items`) or public binders and deck
 * cores (`GET /binders`, effectively public only). Choosing a row closes the dialog with it; the
 * chat sends it at once (a card pins the chat's subject, stage R4). Skeleton, empty, no match and
 * an error with "Try again"; ↑↓ move between rows.
 */
@Component({
  selector: 'app-share-picker-dialog',
  imports: [
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
                      [attr.aria-label]="copy.share(row.name) + (row.line ? ', ' + row.line : '')"
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
                        <span class="sp__binder" [class.sp__binder--core]="row.core" aria-hidden="true">
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
              <p class="sp__empty" role="status">{{ emptyText() }}</p>
            }
          }
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
  private readonly ref = inject<MatDialogRef<SharePickerDialogComponent, ShareChoice>>(MatDialogRef);
  private readonly inventory = inject(InventoryService);
  private readonly binders = inject(BindersService);
  private readonly document = inject(DOCUMENT);

  protected readonly copy = SHARE_COPY;
  protected readonly isCards = this.data.mode === 'card';
  protected readonly title = this.isCards ? SHARE_COPY.cardTitle : SHARE_COPY.binderTitle;
  protected readonly lead = this.isCards
    ? SHARE_COPY.cardBody(this.data.other)
    : SHARE_COPY.binderBody(this.data.other);
  protected readonly placeholder = this.isCards ? SHARE_COPY.cardSearch : SHARE_COPY.binderSearch;
  protected readonly foot = this.isCards ? SHARE_COPY.cardFoot : SHARE_COPY.binderFoot;
  protected readonly errorTitle = this.isCards ? SHARE_COPY.loadError : SHARE_COPY.binderLoadError;

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
        line: [printingCode(item.printing), item.binder?.name ?? '']
          .filter(Boolean)
          .join(' · '),
        price: itemPriceText(item),
        imageUrl: printingImageUrl(item.printing),
        game: item.card.game ?? null,
        core: false,
        choice: { kind: 'item', itemId: item.id, name: item.card.name },
      }));
    }
    const needle = this.query().trim().toLowerCase();
    return this.allBinders()
      .filter((b) => b.effectivePublic && !b.soldAt)
      .filter((b) => !needle || b.name.toLowerCase().includes(needle))
      .map((b) => ({
        id: b.id,
        name: b.name,
        line: b.sellsAsCore ? SHARE_COPY.deckCore : SHARE_COPY.binder,
        price: b.sellsAsCore ? (b.askingPriceText?.trim() ?? null) : null,
        imageUrl: null,
        game: b.game ?? null,
        core: !!b.sellsAsCore,
        choice: { kind: 'binder', binder: { binderId: b.id, name: b.name, itemCount: b.itemCount } },
      }));
  });

  protected readonly emptyText = computed(() => {
    const q = this.query().trim();
    if (q) {
      return this.isCards ? SHARE_COPY.cardNoMatch(q) : SHARE_COPY.binderNoMatch(q);
    }
    return this.isCards ? SHARE_COPY.cardEmpty : SHARE_COPY.binderEmpty;
  });

  constructor() {
    const typing = this.typed
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS))
      .subscribe(() => this.isCards && this.load());
    inject(DestroyRef).onDestroy(() => {
      typing.unsubscribe();
      this.request?.unsubscribe();
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
          { query, sort: 'updated', direction: 'desc', size: CARDS_PAGE },
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
    this.request = this.binders.listMyBinders('body', false, { context: silentErrors() }).subscribe({
      next: (binders) => {
        this.allBinders.set(binders);
        this.status.set('ready');
      },
      error: () => this.status.set('error'),
    });
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
}
