import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import {
  TRADES_FILTERS,
  TradesFilter,
  TradesListStore,
  parseTradesFilter,
} from '../data/trades-list.store';
import { TradeSummaryRowComponent } from './trade-summary-row.component';

/**
 * `/trades` (`?status=all|active|completed|cancelled`): trades opened by accepted offers, both
 * sides, with their status and whose move it is. Live over trade notifications.
 */
@Component({
  selector: 'app-trades-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
    TradeSummaryRowComponent,
  ],
  providers: [TradesListStore],
  template: `
    <div class="page trades">
      @if (auth.isAuthenticated()) {
        <app-page-header
          title="Trades"
          subtitle="Deals you agreed on. Meet, exchange the cards, then confirm to complete them."
        >
          <a actions matButton="outlined" routerLink="/offers">
            <mat-icon aria-hidden="true">local_offer</mat-icon>
            My offers
          </a>
          <mat-button-toggle-group
            aria-label="Trade status"
            hideSingleSelectionIndicator
            [value]="currentFilter()"
            (change)="onFilter($event)"
          >
            @for (option of filters; track option.value) {
              <mat-button-toggle [value]="option.value">{{ option.label }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
        </app-page-header>

        <section aria-label="Your trades" [attr.aria-busy]="store.status() === 'loading'">
          @switch (store.status()) {
            @case ('loading') {
              <span class="visually-hidden">Loading trades</span>
              <app-skeleton variant="list" lines="4" />
            }
            @case ('error') {
              <app-error-state
                title="Your trades could not load"
                [message]="errorMessage()"
                [requestId]="store.error()?.requestId ?? null"
                (retry)="store.load()"
              />
            }
            @default {
              @if (store.items().length === 0) {
                @if (currentFilter() !== 'all') {
                  <app-empty-state
                    icon="filter_alt_off"
                    title="No trades with this status"
                    description="Try another status to see the rest of your trades."
                  >
                    <button actions matButton="outlined" type="button" (click)="setFilter('all')">
                      Show all trades
                    </button>
                  </app-empty-state>
                } @else {
                  <app-empty-state
                    icon="handshake"
                    title="No trades yet"
                    description="A trade opens when an offer is accepted. Make an offer on a card near you, or answer the ones you receive."
                  >
                    <a actions matButton="filled" routerLink="/offers">Open my offers</a>
                    <a actions matButton="outlined" routerLink="/map">Explore the map</a>
                  </app-empty-state>
                }
              } @else {
                <ul class="trades__list" aria-label="Trades">
                  @for (trade of store.items(); track trade.id) {
                    <li><app-trade-summary-row [trade]="trade" /></li>
                  }
                </ul>
                @if (store.hasMore()) {
                  <div class="trades__more">
                    @if (store.moreFailed()) {
                      <p class="trades__muted" role="alert">Older trades could not load.</p>
                    }
                    <button
                      matButton="outlined"
                      type="button"
                      [disabled]="store.loadingMore()"
                      (click)="store.loadMore()"
                    >
                      {{
                        store.loadingMore()
                          ? 'Loading…'
                          : store.moreFailed()
                            ? 'Try again'
                            : 'Load older trades'
                      }}
                    </button>
                  </div>
                }
              }
            }
          }
        </section>
      } @else {
        <app-empty-state
          icon="lock_person"
          title="Trades are for members"
          description="Sign in to follow the trades you agreed on."
        >
          <a
            actions
            matButton="filled"
            routerLink="/auth/sign-in"
            [queryParams]="{ returnUrl: '/trades' }"
            >Sign in</a
          >
        </app-empty-state>
      }
    </div>
  `,
  styles: `
    .trades {
      max-width: 960px;
    }
    .trades__list {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      list-style: none;
    }
    .trades__list li + li {
      border-top: 1px solid var(--color-border);
    }
    .trades__more {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--spacing-2);
      margin-top: var(--spacing-4);
    }
    .trades__muted {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradesPageComponent {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(TradesListStore);
  private readonly router = inject(Router);

  /** Query parameter (bound by the router). */
  readonly status = input<string | undefined>();

  protected readonly filters = TRADES_FILTERS;
  protected readonly currentFilter = computed(() => parseTradesFilter(this.status()));
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });

  constructor() {
    this.store.init();
    effect(() => {
      const value = this.currentFilter();
      if (this.auth.isAuthenticated()) {
        untracked(() => this.store.setFilter(value));
      }
    });
  }

  protected onFilter(event: MatButtonToggleChange): void {
    this.setFilter(event.value as TradesFilter);
  }

  protected setFilter(value: TradesFilter): void {
    void this.router.navigate([], {
      queryParams: { status: value === 'all' ? null : value },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
