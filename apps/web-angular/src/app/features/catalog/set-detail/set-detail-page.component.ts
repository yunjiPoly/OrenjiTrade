import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { CardSummary, CatalogService, SetDetail } from '@orenji/api-client';
import { Subscription, filter } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { APP_NAME } from '../../../core/routing/orenji-title.strategy';
import { CardDataAttributionComponent } from '../../../shared/catalog/card-data-attribution/card-data-attribution.component';
import { CardGridComponent } from '../../../shared/catalog/card-grid/card-grid.component';
import { metadataEntries } from '../../../shared/catalog/catalog-labels';
import { gameInfo } from '../../../shared/domain/games';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { GameChipComponent } from '../../../shared/ui/game-chip/game-chip.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { PrintingsTableComponent } from '../shared/printings-table.component';

const CHECKLIST_PAGE_SIZE = 50;
/** Cards shown in the grid (API maximum page size). */
const SET_CARDS_LIMIT = 100;

/**
 * `/sets/:id`: set header (game, code, series, release date, size), its cards and the paginated
 * printing checklist (`GET /sets/{id}`), with card names from `GET /cards?set=`.
 */
@Component({
  selector: 'app-set-detail-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    CardDataAttributionComponent,
    CardGridComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    GameChipComponent,
    PrintingsTableComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="page set">
      <nav class="crumbs" aria-label="Breadcrumb">
        <a routerLink="/cards">Cards</a>
        @if (detail()?.set; as set) {
          <mat-icon class="crumbs__sep" aria-hidden="true">chevron_right</mat-icon>
          <a routerLink="/cards" [queryParams]="{ game: set.game }">{{ gameLabel() }}</a>
          <mat-icon class="crumbs__sep" aria-hidden="true">chevron_right</mat-icon>
          <span aria-current="page">{{ set.name }}</span>
        }
      </nav>

      @if (notFound()) {
        <app-empty-state
          icon="collections_bookmark"
          title="Set not found"
          description="This set does not exist or is no longer in the catalog."
        >
          <a actions matButton="filled" routerLink="/cards">Browse the catalog</a>
        </app-empty-state>
      } @else if (error(); as error) {
        <app-error-state
          title="This set could not load"
          [message]="errorMessage()"
          [requestId]="error.requestId"
          (retry)="reload()"
        />
      } @else if (detail()?.set; as set) {
        <header class="set__hero" [style.--set-accent]="accent()">
          <span class="set__code mono">{{ set.code }}</span>
          <div class="set__heading">
            <app-game-chip [slug]="set.game ?? ''" />
            <h1 class="set__name">{{ set.name }}</h1>
            @if (set.series) {
              <p class="set__series">{{ set.series }}</p>
            }
          </div>
          <dl class="set__facts">
            @if (set.releaseDate) {
              <div>
                <dt>Released</dt>
                <dd>{{ set.releaseDate | date: 'mediumDate' }}</dd>
              </div>
            }
            @if (set.totalCards) {
              <div>
                <dt>Cards in set</dt>
                <dd>{{ set.totalCards }}</dd>
              </div>
            }
            <div>
              <dt>Printings listed</dt>
              <dd>{{ set.printingCount ?? detail()?.printings?.totalItems ?? 0 }}</dd>
            </div>
            @for (fact of extraFacts(); track fact.key) {
              <div>
                <dt>{{ fact.label }}</dt>
                <dd>{{ fact.value }}</dd>
              </div>
            }
          </dl>
        </header>

        <section class="set__section" aria-labelledby="set-cards-title">
          <div class="set__section-head">
            <h2 id="set-cards-title" class="set__h2">Cards</h2>
            <a
              class="set__search"
              routerLink="/cards"
              [queryParams]="{ game: set.game, set: set.code }"
            >
              Search in this set
            </a>
          </div>
          @if (cardsError()) {
            <app-error-state
              compact
              title="Cards could not load"
              [message]="cardsError()!"
              (retry)="loadCards(id())"
            />
          } @else {
            <app-card-grid
              [cards]="cards() ?? []"
              [loading]="cards() === null"
              label="Cards in this set"
            />
            @if (cardsTotal() > (cards()?.length ?? 0)) {
              <p class="set__more">
                Showing {{ cards()?.length }} of {{ cardsTotal() }} cards.
                <a routerLink="/cards" [queryParams]="{ game: set.game, set: set.code }">See all</a>
              </p>
            }
            <app-card-data-attribution class="set__attribution" [game]="set.game ?? null" />
          }
        </section>

        <section class="set__section" aria-labelledby="set-checklist-title">
          <h2 id="set-checklist-title" class="set__h2">Checklist</h2>
          @if ((detail()?.printings?.items ?? []).length) {
            <app-printings-table
              mode="set"
              [printings]="detail()?.printings?.items ?? []"
              [cardNames]="cardNames()"
              [game]="set.game"
              [label]="set.name + ' checklist'"
            />
            @if ((detail()?.printings?.totalPages ?? 0) > 1) {
              <mat-paginator
                [length]="detail()?.printings?.totalItems ?? 0"
                [pageIndex]="detail()?.printings?.page ?? 0"
                [pageSize]="checklistSize"
                [hidePageSize]="true"
                (page)="onChecklistPage($event)"
                aria-label="Checklist pages"
              />
            }
          } @else {
            <p class="set__muted">No printings are recorded for this set yet.</p>
          }
        </section>
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading set</span>
          <app-skeleton width="60%" height="2.5rem" />
          <app-card-grid [cards]="[]" [loading]="true" skeletonCount="6" />
        </div>
      }
    </div>
  `,
  styles: `
    .crumbs {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-1);
      margin-bottom: var(--spacing-4);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .crumbs a {
      color: var(--color-text-muted);
    }
    .crumbs [aria-current='page'] {
      color: var(--color-ink);
      font-weight: var(--font-weight-medium);
    }
    .crumbs__sep {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .set__hero {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--spacing-3) var(--spacing-5);
      align-items: center;
      margin-bottom: var(--spacing-8);
      padding: var(--spacing-6);
      border-radius: var(--radius-lg);
      border: 1px solid color-mix(in srgb, var(--set-accent) 30%, var(--color-border));
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--set-accent) 16%, var(--color-surface)),
        var(--color-surface) 70%
      );
    }
    .set__code {
      display: grid;
      place-items: center;
      width: 88px;
      height: 88px;
      border-radius: var(--radius-lg);
      background: var(--set-accent);
      color: #fff;
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      box-shadow: var(--elevation-menu);
    }
    .set__heading {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-1);
    }
    .set__name {
      font-size: var(--font-size-3xl);
    }
    .set__series {
      margin: 0;
      color: var(--color-text-muted);
    }
    .set__facts {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-3) var(--spacing-8);
      margin: 0;
    }
    .set__facts dt {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .set__facts dd {
      margin: 2px 0 0;
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
    }
    .set__section {
      margin-bottom: var(--spacing-8);
    }
    .set__section-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--spacing-2);
    }
    .set__h2 {
      margin-bottom: var(--spacing-3);
      font-size: var(--font-size-xl);
    }
    .set__attribution {
      margin-top: var(--spacing-3);
    }
    .set__more,
    .set__muted {
      margin-top: var(--spacing-3);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    @media (max-width: 599px) {
      .set__hero {
        grid-template-columns: 1fr;
        padding: var(--spacing-4);
      }
      .set__code {
        width: 64px;
        height: 64px;
        font-size: var(--font-size-lg);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetDetailPageComponent {
  private readonly api = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly title = inject(Title);

  readonly id = input.required<string>();

  protected readonly checklistSize = CHECKLIST_PAGE_SIZE;
  protected readonly detail = signal<SetDetail | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly cards = signal<CardSummary[] | null>(null);
  protected readonly cardsTotal = signal(0);
  protected readonly cardsError = signal<string | null>(null);
  protected readonly checklistPage = signal(0);

  protected readonly notFound = computed(() => {
    const error = this.error();
    return !!error && (error.status === 404 || error.errorCode === 'VALIDATION_FAILED');
  });
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly gameLabel = computed(() => gameInfo(this.detail()?.set?.game ?? '').label);
  protected readonly accent = computed(
    () => `var(${gameInfo(this.detail()?.set?.game ?? '').colorVar})`,
  );
  protected readonly extraFacts = computed(() =>
    metadataEntries(null, this.detail()?.metadata, { includeUndeclared: true }),
  );
  protected readonly cardNames = computed<Record<string, string>>(() =>
    Object.fromEntries((this.cards() ?? []).map((card) => [card.id ?? '', card.name ?? ''])),
  );

  /** Set id the card grid was loaded for. */
  private cardsFor: string | null = null;
  private detailSubscription: Subscription | null = null;
  private cardsSubscription: Subscription | null = null;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.checklistPage.set(0);
        this.load(id, 0);
      });
    });
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => setTimeout(() => this.applyTitle()));
    inject(DestroyRef).onDestroy(() => {
      this.detailSubscription?.unsubscribe();
      this.cardsSubscription?.unsubscribe();
    });
  }

  protected reload(): void {
    this.load(this.id(), this.checklistPage());
  }

  protected onChecklistPage(event: PageEvent): void {
    this.checklistPage.set(event.pageIndex);
    this.load(this.id(), event.pageIndex);
  }

  protected loadCards(id: string): void {
    this.cardsFor = id;
    this.cardsSubscription?.unsubscribe();
    this.cards.set(null);
    this.cardsError.set(null);
    this.cardsSubscription = this.api
      .searchCards({ set: id, size: SET_CARDS_LIMIT }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (page) => {
          this.cards.set(page.items ?? []);
          this.cardsTotal.set(page.totalItems ?? 0);
        },
        error: (error: unknown) => this.cardsError.set(friendlyMessage(toApiError(error))),
      });
  }

  private load(id: string, page: number): void {
    this.detailSubscription?.unsubscribe();
    if (this.detail()?.set?.id !== id) {
      this.detail.set(null);
    }
    this.error.set(null);
    this.detailSubscription = this.api
      .getSet({ id, page, size: CHECKLIST_PAGE_SIZE }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (detail) => {
          const first = this.cardsFor !== id;
          this.detail.set(detail);
          this.applyTitle();
          // The set's cards load once the set is known (not for unknown ids or other pages).
          if (first || this.cardsError()) {
            this.loadCards(id);
          }
        },
        error: (error: unknown) => {
          this.detail.set(null);
          this.error.set(toApiError(error));
        },
      });
  }

  private applyTitle(): void {
    const name = this.detail()?.set?.name;
    if (name) {
      this.title.setTitle(`${name} · ${APP_NAME}`);
    }
  }
}
