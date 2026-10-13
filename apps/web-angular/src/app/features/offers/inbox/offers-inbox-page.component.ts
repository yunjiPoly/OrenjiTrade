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
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import {
  INBOX_FILTERS,
  InboxFilter,
  OffersInboxStore,
  parseInboxQuery,
} from '../data/offers-inbox.store';
import { OfferSummaryRowComponent } from './offer-summary-row.component';

/**
 * `/offers` (`?tab=received|sent&status=all|active|accepted|closed`): the caller's offers in two
 * tabs (Received: offers on their cards; Sent: offers they made) with a status filter, cursor
 * pages and "Your turn" badges. Live: offer notifications re-read the list.
 */
@Component({
  selector: 'app-offers-inbox-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatTabsModule,
    EmptyStateComponent,
    ErrorStateComponent,
    OfferSummaryRowComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  providers: [OffersInboxStore],
  template: `
    <div class="page inbox">
      @if (auth.isAuthenticated()) {
        <app-page-header
          title="Offers"
          subtitle="Offers on your cards and the ones you made. Answer when it is your turn."
        >
          <a actions matButton="outlined" routerLink="/trades">
            <mat-icon aria-hidden="true">sync_alt</mat-icon>
            My trades
          </a>
          <a actions matButton routerLink="/settings/offers">
            <mat-icon aria-hidden="true">tune</mat-icon>
            Offer settings
          </a>
        </app-page-header>

        <nav mat-tab-nav-bar [tabPanel]="panel" aria-label="Offer lists" class="inbox__tabs">
          <a
            mat-tab-link
            [active]="query().tab === 'received'"
            [routerLink]="[]"
            [queryParams]="{ tab: null }"
            queryParamsHandling="merge"
          >
            <mat-icon aria-hidden="true">move_to_inbox</mat-icon>
            Received
          </a>
          <a
            mat-tab-link
            [active]="query().tab === 'sent'"
            [routerLink]="[]"
            [queryParams]="{ tab: 'sent' }"
            queryParamsHandling="merge"
          >
            <mat-icon aria-hidden="true">outbox</mat-icon>
            Sent
          </a>
        </nav>
        <mat-tab-nav-panel #panel>
          <div class="inbox__bar">
            <mat-button-toggle-group
              aria-label="Offer status"
              hideSingleSelectionIndicator
              [value]="query().filter"
              (change)="onFilter($event)"
            >
              @for (option of filters; track option.value) {
                <mat-button-toggle [value]="option.value">{{ option.label }}</mat-button-toggle>
              }
            </mat-button-toggle-group>
            @if (store.yourTurnCount() > 0) {
              <p class="inbox__turns" role="status">
                <mat-icon aria-hidden="true">notifications_active</mat-icon>
                {{ store.yourTurnCount() }}
                {{ store.yourTurnCount() === 1 ? 'offer waits' : 'offers wait' }} for your answer
              </p>
            }
          </div>

          <section
            class="inbox__body"
            [attr.aria-label]="query().tab === 'sent' ? 'Offers you sent' : 'Offers you received'"
            [attr.aria-busy]="store.status() === 'loading'"
          >
            @switch (store.status()) {
              @case ('loading') {
                <span class="visually-hidden">Loading offers</span>
                <app-skeleton variant="list" lines="4" />
              }
              @case ('error') {
                <app-error-state
                  title="Your offers could not load"
                  [message]="errorMessage()"
                  [requestId]="store.error()?.requestId ?? null"
                  (retry)="store.load()"
                />
              }
              @default {
                @if (store.items().length === 0) {
                  @if (query().filter !== 'all') {
                    <app-empty-state
                      icon="filter_alt_off"
                      title="No offers with this status"
                      description="Try another status to see the rest of your offers."
                    >
                      <button actions matButton="outlined" type="button" (click)="setFilter('all')">
                        Show all offers
                      </button>
                    </app-empty-state>
                  } @else if (query().tab === 'sent') {
                    <app-empty-state
                      icon="local_offer"
                      title="You have not made any offer yet"
                      description="Find a card of your region on the map or in search, then press “Make an offer”."
                    >
                      <a actions matButton="filled" routerLink="/map">Explore the map</a>
                    </app-empty-state>
                  } @else {
                    <app-empty-state
                      icon="move_to_inbox"
                      title="No offers on your cards yet"
                      description="Publish cards that accept offers: collectors of your region can then make you one."
                    >
                      <a actions matButton="filled" routerLink="/inventory">Open my inventory</a>
                    </app-empty-state>
                  }
                } @else {
                  <ul class="inbox__list" aria-label="Offers">
                    @for (offer of store.items(); track offer.id) {
                      <li><app-offer-summary-row [offer]="offer" /></li>
                    }
                  </ul>
                  @if (store.hasMore()) {
                    <div class="inbox__more">
                      @if (store.moreFailed()) {
                        <p class="inbox__muted" role="alert">Older offers could not load.</p>
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
                              : 'Load older offers'
                        }}
                      </button>
                    </div>
                  }
                }
              }
            }
          </section>
        </mat-tab-nav-panel>
      } @else {
        <app-empty-state
          icon="lock_person"
          title="Offers are for members"
          description="Sign in to make offers on cards of your region and answer the ones you receive."
        >
          <a
            actions
            matButton="filled"
            routerLink="/auth/sign-in"
            [queryParams]="{ returnUrl: '/offers' }"
            >Sign in</a
          >
        </app-empty-state>
      }
    </div>
  `,
  styles: `
    .inbox {
      max-width: 960px;
    }
    .inbox__tabs mat-icon {
      margin-right: var(--spacing-2);
    }
    .inbox__bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-3);
      margin: var(--spacing-4) 0;
    }
    .inbox__turns {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      margin: 0;
      padding: 4px var(--spacing-3);
      border-radius: var(--radius-pill);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .inbox__turns mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .inbox__list {
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
    .inbox__list li + li {
      border-top: 1px solid var(--color-border);
    }
    .inbox__more {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--spacing-2);
      margin-top: var(--spacing-4);
    }
    .inbox__muted {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OffersInboxPageComponent {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(OffersInboxStore);
  private readonly router = inject(Router);

  /** Query parameters (bound by the router). */
  readonly tab = input<string | undefined>();
  readonly status = input<string | undefined>();

  protected readonly filters = INBOX_FILTERS;
  protected readonly query = computed(() =>
    parseInboxQuery({ tab: this.tab(), status: this.status() }),
  );
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });

  constructor() {
    this.store.init();
    effect(() => {
      const query = this.query();
      if (this.auth.isAuthenticated()) {
        untracked(() => this.store.setQuery(query));
      }
    });
  }

  protected onFilter(event: MatButtonToggleChange): void {
    this.setFilter(event.value as InboxFilter);
  }

  protected setFilter(filter: InboxFilter): void {
    void this.router.navigate([], {
      queryParams: { status: filter === 'all' ? null : filter },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
