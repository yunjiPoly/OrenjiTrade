import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { InventoryItemResponse, InventoryService } from '@orenji/api-client';
import { Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { silentErrors } from '../../core/http/http-context';
import { CardImageComponent } from '../ui/card-image/card-image.component';
import { conditionLabel } from '../inventory/inventory-labels';
import { QuantityStepperComponent } from '../ui/quantity-stepper/quantity-stepper.component';
import { OFFER_TRADE_ITEMS_MAX } from './offer-labels';
import { TradeLine, tradeLineFromInventory } from './offer-form';

const RESULTS = 8;

type SearchState =
  { kind: 'loading' } | { kind: 'ready'; items: InventoryItemResponse[] } | { kind: 'error' };

/**
 * The cards of a trade or mixed offer. `inventory` mode (the buyer): search the caller's own
 * inventory (`GET /inventory/items`, private cards included: public visibility is not required)
 * and add cards with a number of copies up to what they hold. `proposal` mode (the seller
 * answering): the cards stay the buyer's, so only the proposal's cards can be kept, removed or
 * given fewer copies. Emits the new selection; validation messages come from the form.
 */
@Component({
  selector: 'app-offer-card-picker',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    CardImageComponent,
    QuantityStepperComponent,
  ],
  template: `
    <div class="picker" role="group" [attr.aria-label]="label()">
      @if (lines().length > 0) {
        <ul class="chosen" aria-label="Cards in your offer">
          @for (line of lines(); track line.inventoryItemId) {
            <li class="chosen__row">
              <app-card-image
                class="chosen__img"
                [src]="line.imageUrl"
                [game]="line.game"
                [alt]="line.cardName"
              />
              <span class="chosen__text">
                <span class="chosen__name">{{ line.cardName }}</span>
                <span class="chosen__meta">
                  @if (line.printingCode) {
                    <span class="mono">{{ line.printingCode }}</span> ·
                  }
                  {{ condition(line.condition) }} · {{ line.maxQuantity }} held
                </span>
              </span>
              <app-quantity-stepper
                [value]="line.quantity"
                [max]="line.maxQuantity"
                [label]="line.cardName"
                [disabled]="disabled()"
                (valueChange)="setQuantity(line, $event)"
              />
              <button
                matIconButton
                type="button"
                [disabled]="disabled()"
                [attr.aria-label]="'Remove ' + line.cardName + ' from the offer'"
                (click)="remove(line)"
              >
                <mat-icon>close</mat-icon>
              </button>
            </li>
          }
        </ul>
      }

      @if (mode() === 'proposal') {
        @if (removed().length > 0) {
          <p class="picker__hint">Put back a card of the proposal:</p>
          <ul class="results" aria-label="Cards removed from the proposal">
            @for (line of removed(); track line.inventoryItemId) {
              <li class="results__row">
                <span class="results__name">{{ line.cardName }}</span>
                <button
                  matButton
                  type="button"
                  [disabled]="disabled()"
                  [attr.aria-label]="'Put back ' + line.cardName"
                  (click)="add(line)"
                >
                  <mat-icon aria-hidden="true">undo</mat-icon>
                  Put back
                </button>
              </li>
            }
          </ul>
        } @else if (pool().length === 0) {
          <p class="picker__hint">
            Only the buyer's cards can be part of the deal, and this proposal has none. Answer with
            cash, or decline.
          </p>
        }
      } @else {
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="picker__search">
          <mat-label>Search your inventory</mat-label>
          <mat-icon matPrefix aria-hidden="true">search</mat-icon>
          <input
            matInput
            type="search"
            [formControl]="query"
            maxlength="80"
            autocomplete="off"
            [attr.aria-describedby]="hintId"
          />
        </mat-form-field>
        <p class="picker__hint" [id]="hintId">
          Private cards can be offered too. Up to {{ maxCards }} different cards.
        </p>
        @switch (search().kind) {
          @case ('loading') {
            <p class="picker__status" aria-busy="true">Searching your cards…</p>
          }
          @case ('error') {
            <p class="picker__status" role="alert">
              Your cards could not load.
              <button matButton type="button" (click)="reload()">Retry</button>
            </p>
          }
          @default {
            @if (results().length === 0) {
              <p class="picker__status">
                {{ query.value ? 'No card of yours matches.' : 'Your inventory is empty.' }}
              </p>
            } @else {
              <ul class="results" aria-label="Your cards">
                @for (item of results(); track item.id) {
                  <li class="results__row">
                    <app-card-image
                      class="results__img"
                      [src]="imageOf(item)"
                      [game]="item.card.game"
                      [alt]="item.card.name"
                    />
                    <span class="results__text">
                      <span class="results__name">{{ item.card.name }}</span>
                      <span class="results__meta">
                        <span class="mono">{{ item.printing.printingCode }}</span> ·
                        {{ condition(item.condition) }} · ×{{ item.quantity }}
                      </span>
                    </span>
                    @if (isChosen(item.id)) {
                      <span class="results__added">
                        <mat-icon aria-hidden="true">check</mat-icon>
                        Added
                      </span>
                    } @else {
                      <button
                        matButton="tonal"
                        type="button"
                        [disabled]="disabled() || full()"
                        [attr.aria-label]="'Add ' + item.card.name + ' to the offer'"
                        (click)="add(lineOf(item))"
                      >
                        <mat-icon aria-hidden="true">add</mat-icon>
                        Add
                      </button>
                    }
                  </li>
                }
              </ul>
            }
          }
        }
      }
    </div>
  `,
  styles: `
    .picker {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
    }
    .chosen,
    .results {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .chosen__row,
    .results__row {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      animation: row-in var(--motion-duration-base) var(--motion-easing-standard);
    }
    .chosen__row {
      border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
      background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
    }
    .chosen__img,
    .results__img {
      flex: 0 0 auto;
      width: 36px;
    }
    .chosen__text,
    .results__text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
    }
    .chosen__name,
    .results__name {
      overflow: hidden;
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .results__row .results__name {
      flex: 1 1 auto;
    }
    .chosen__meta,
    .results__meta {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .results__added {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 var(--spacing-3);
      color: var(--color-success);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .picker__search {
      width: 100%;
    }
    .picker__hint,
    .picker__status {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    @keyframes row-in {
      from {
        opacity: 0;
        transform: translateY(2px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .chosen__row,
      .results__row {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferCardPickerComponent {
  private readonly api = inject(InventoryService);

  readonly lines = input.required<readonly TradeLine[]>();
  readonly mode = input<'inventory' | 'proposal'>('inventory');
  /** Cards of the proposal being answered (`proposal` mode). */
  readonly pool = input<readonly TradeLine[]>([]);
  readonly disabled = input(false);
  readonly label = input('Cards you offer');
  readonly linesChange = output<TradeLine[]>();

  protected readonly maxCards = OFFER_TRADE_ITEMS_MAX;
  protected readonly hintId = `offer-cards-hint-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly query = new FormControl('', { nonNullable: true });
  protected readonly search = signal<SearchState>({ kind: 'loading' });
  protected readonly results = computed(() => {
    const state = this.search();
    return state.kind === 'ready' ? state.items : [];
  });
  protected readonly full = computed(() => this.lines().length >= OFFER_TRADE_ITEMS_MAX);
  protected readonly removed = computed(() => {
    const chosen = new Set(this.lines().map((line) => line.inventoryItemId));
    return this.pool().filter((line) => !chosen.has(line.inventoryItemId));
  });

  private readonly searches = new Subject<string>();

  constructor() {
    this.searches
      .pipe(
        switchMap((text) => {
          this.search.set({ kind: 'loading' });
          return this.api
            .listInventoryItems(
              {
                query: text || undefined,
                sort: 'name',
                direction: 'asc',
                size: RESULTS,
              },
              'body',
              false,
              { context: silentErrors() },
            )
            .pipe(
              map((page): SearchState => ({ kind: 'ready', items: page.items ?? [] })),
              catchError(() => of<SearchState>({ kind: 'error' })),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.search.set(state));
    this.query.valueChanges
      .pipe(
        map((text) => text.trim()),
        debounceTime(250),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((text) => this.searches.next(text));
    // The inventory is only read in inventory mode, once the mode is known.
    effect(() => {
      if (this.mode() === 'inventory') {
        untracked(() => this.reload());
      }
    });
  }

  protected reload(): void {
    this.searches.next(this.query.value.trim());
  }

  protected isChosen(id: string): boolean {
    return this.lines().some((line) => line.inventoryItemId === id);
  }

  protected lineOf(item: InventoryItemResponse): TradeLine {
    return tradeLineFromInventory(item);
  }

  protected imageOf(item: InventoryItemResponse): string | null {
    return tradeLineFromInventory(item).imageUrl ?? null;
  }

  protected condition(value: string | null | undefined): string {
    return conditionLabel(value);
  }

  protected add(line: TradeLine): void {
    if (this.isChosen(line.inventoryItemId) || this.full()) {
      return;
    }
    this.linesChange.emit([...this.lines(), { ...line }]);
  }

  protected remove(line: TradeLine): void {
    this.linesChange.emit(
      this.lines().filter((candidate) => candidate.inventoryItemId !== line.inventoryItemId),
    );
  }

  protected setQuantity(line: TradeLine, quantity: number): void {
    this.linesChange.emit(
      this.lines().map((candidate) =>
        candidate.inventoryItemId === line.inventoryItemId ? { ...candidate, quantity } : candidate,
      ),
    );
  }
}
