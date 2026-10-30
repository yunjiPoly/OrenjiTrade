import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService } from '@orenji/api-client';
import type { CardSummary, SetSummary } from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { silentErrors } from '../../../core/http/http-context';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { gameInfo } from '../../../shared/domain/games';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';

/** Cards per page of one set (`GET /cards?set=`, the API's maximum). */
export const SET_CARDS_PAGE_SIZE = 50;

/** "Azure Dawn · AZR" (the phone's set chip, stage R14). */
export function setChipLabel(set: Pick<SetSummary, 'name' | 'code'> | null): string {
  if (!set) {
    return '';
  }
  return set.name && set.code ? `${set.name} · ${set.code}` : (set.name ?? set.code ?? '');
}

type Status = 'loading' | 'ready' | 'error';

/**
 * Search › Cards on the cards of one set (a set page's "Who has cards of this set", spec 7.5; the
 * phone's set chip, stage R14): the chip "Azure Dawn · AZR" with "Show every card, not only AZR",
 * then the set's cards (picture and name, no count), filtered by the field's text, page after
 * page with "Load more"; a card opens Who has this card. Skeletons, an empty state, an error with
 * Try again.
 */
@Component({
  selector: 'app-set-cards',
  imports: [RouterLink, CardImageComponent, ShellIconComponent],
  template: `
    <div class="sc">
      <button
        type="button"
        class="sc__chip"
        data-testid="set-chip"
        [attr.aria-label]="'Show every card, not only ' + (set()?.code || chip())"
        (click)="cleared.emit()"
      >
        <span>{{ chip() || 'This set' }}</span>
        <app-shell-icon name="close" [size]="16" />
      </button>
      @if (status() === 'error' && cards().length === 0) {
        <div class="sc__state" role="alert">
          <p>The cards of this set could not load.</p>
          <button type="button" class="sc__action" (click)="reload()">Try again</button>
        </div>
      } @else if (status() === 'loading' && cards().length === 0) {
        <div aria-busy="true">
          <span class="visually-hidden" role="status">Loading the cards of this set</span>
          @for (bone of [0, 1, 2, 3, 4, 5]; track bone) {
            <span class="sc__bone" aria-hidden="true"></span>
          }
        </div>
      } @else if (cards().length === 0) {
        <p class="sc__empty" data-testid="set-cards-empty">
          @if (otherGame(); as other) {
            {{ (set()?.code || 'This set') + ' is a ' + other + ' set, not a ' + gameName() + ' one.' }}
          } @else {
            {{
              q()
                ? 'No card of ' + (set()?.code || 'this set') + ' matches ‘' + q() + '’.'
                : 'This set has no cards in the catalogue yet.'
            }}
          }
        </p>
      } @else {
        <ul class="sc__rows" [attr.aria-label]="'Cards of ' + (chip() || 'this set')">
          @for (card of cards(); track card.id) {
            <li>
              <a class="sc__row" data-testid="set-card-row" [routerLink]="['/cards', card.id]">
                <app-card-image
                  class="sc__art"
                  [src]="card.primaryImageUrl"
                  [game]="card.game"
                  alt=""
                />
                <span class="sc__name">{{ card.name }}</span>
                <app-shell-icon class="sc__muted" name="chevronRight" [size]="18" />
              </a>
            </li>
          }
        </ul>
        @if (hasMore()) {
          <button
            type="button"
            class="sc__more"
            [disabled]="status() === 'loading'"
            (click)="loadMore()"
          >
            {{ status() === 'loading' ? 'Loading…' : 'Load more' }}
          </button>
        }
        @if (status() === 'error') {
          <p class="sc__empty" role="alert">
            More cards could not load.
            <button type="button" class="sc__action" (click)="loadMore()">Try again</button>
          </p>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .sc {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .sc__chip {
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
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
    .sc__rows {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0 -12px;
      padding: 0;
      list-style: none;
    }
    .sc__row {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 64px;
      padding: 6px 12px;
      border-radius: var(--radius-row);
      color: var(--color-ink);
      text-decoration: none;
    }
    .sc__row:hover,
    .sc__row:focus-visible {
      background: var(--color-primary-tint-subtle);
    }
    .sc__row:focus-visible {
      outline: 2px solid transparent;
      outline-offset: -2px;
      box-shadow: inset 0 0 0 2px var(--color-accent);
    }
    .sc__art {
      flex: 0 0 36px;
      width: 36px;
    }
    .sc__name {
      flex: 1;
      min-width: 0;
      font-weight: var(--font-weight-semibold);
    }
    .sc__muted {
      color: var(--color-text-muted);
    }
    .sc__empty,
    .sc__state p {
      margin: 0;
      color: var(--color-text-muted);
    }
    .sc__state {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
    .sc__action {
      padding: 0;
      border: 0;
      background: none;
      color: var(--color-accent);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .sc__more {
      align-self: flex-start;
      min-height: 40px;
      padding: 0 18px;
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-ink);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .sc__bone {
      display: block;
      height: 52px;
      margin: 8px 0;
      border-radius: var(--radius-row);
      background: var(--color-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetCardsComponent {
  private readonly catalog = inject(CatalogService);

  readonly setId = input.required<string>();
  /**
   * The browsed game (the game pill): sent with `set=`, as the phone does, so a set never lists
   * the cards of another game under the pill (WD review R1-1).
   */
  readonly game = input('');
  readonly gameName = input('');
  readonly q = input('');
  /** "Show every card": back to the whole catalogue of the browsed game. */
  readonly cleared = output<void>();

  protected readonly set = signal<SetSummary | null>(null);
  protected readonly cards = signal<CardSummary[]>([]);
  protected readonly status = signal<Status>('loading');
  private readonly page = signal(0);
  private readonly totalPages = signal(0);
  protected readonly hasMore = computed(() => this.page() + 1 < this.totalPages());
  protected readonly chip = computed(() => setChipLabel(this.set()));
  /** "Yu-Gi-Oh!" when the set belongs to another game than the browsed one (a hand-made link). */
  protected readonly otherGame = computed(() => {
    const own = this.set()?.game;
    const game = this.game();
    return own && game && own !== game ? gameInfo(own).label : null;
  });
  private request = 0;
  private subscriptions: Subscription[] = [];

  constructor() {
    effect(() => {
      const id = this.setId();
      untracked(() => {
        this.set.set(null);
        this.subscriptions.push(
          this.catalog
            .getSet({ id, page: 0, size: 1 }, 'body', false, { context: silentErrors() })
            .subscribe({
              next: (detail) => this.set.set(detail.set ?? null),
              error: () => this.set.set(null),
            }),
        );
      });
    });
    effect(() => {
      this.setId();
      this.game();
      this.q();
      untracked(() => this.reload());
    });
    inject(DestroyRef).onDestroy(() => this.subscriptions.forEach((sub) => sub.unsubscribe()));
  }

  protected reload(): void {
    this.cards.set([]);
    this.page.set(0);
    this.totalPages.set(0);
    this.fetch(0);
  }

  protected loadMore(): void {
    if (this.status() !== 'loading') {
      this.fetch(this.cards().length === 0 ? 0 : this.page() + 1);
    }
  }

  private fetch(page: number): void {
    const request = ++this.request;
    this.status.set('loading');
    const query = this.q().trim();
    const game = this.game();
    this.subscriptions.push(
      this.catalog
        .searchCards(
          {
            set: this.setId(),
            ...(game ? { game } : {}),
            page,
            size: SET_CARDS_PAGE_SIZE,
            ...(query ? { query } : {}),
          },
          'body',
          false,
          { context: silentErrors() },
        )
        .subscribe({
          next: (result) => {
            if (request !== this.request) {
              return;
            }
            const items = result.items ?? [];
            this.cards.set(page === 0 ? items : [...this.cards(), ...items]);
            this.page.set(result.page ?? page);
            this.totalPages.set(result.totalPages ?? 0);
            this.status.set('ready');
          },
          error: () => {
            if (request === this.request) {
              this.status.set('error');
            }
          },
        }),
    );
  }
}
