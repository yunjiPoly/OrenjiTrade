import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminAnalyticsService, AnalyticsSummary } from '@orenji/api-client';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { AdminIconComponent } from '../console/admin-icon.component';
import { shareWords } from '../console/console-labels';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { dailyTotals, derivedTiles, eventTotals } from './analytics-summary';

const PERIODS = [7, 14, 30] as const;

/**
 * `/admin/analytics` (administrators): product events of the period from the local aggregate
 * (`GET /admin/analytics/summary?days=`): the total, events per day and totals per event type.
 * Events never carry coordinates or personal data.
 */
@Component({
  selector: 'app-admin-analytics-page',
  imports: [
    DatePipe,
    EmptyStateComponent,
    ErrorStateComponent,
    AdminIconComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="cp">
      <header class="cp__head">
        <div class="cp__heading">
          <p class="cp__eyebrow">System</p>
          <h1 class="cp__title">Analytics</h1>
          <p class="cp__sub">
            How collectors use OrenjiTrade: searches, views, messages, wishes and reports. Counts
            only: never personal data or places.
          </p>
        </div>
        <div class="cp__actions">
          <div class="cp-seg" role="group" aria-label="Period">
            @for (period of periods; track period) {
              <button
                type="button"
                class="cp-seg__btn"
                [attr.aria-pressed]="days() === period"
                (click)="setDays(period)"
              >
                {{ period }} days
              </button>
            }
          </div>
        </div>
      </header>

      @if (error(); as error) {
        <app-error-state
          title="Analytics could not load"
          retryLabel="Try again"
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="load()"
        />
      } @else if (summary(); as s) {
        <div class="head">
          <div class="head__total">
            <span class="head__value" data-testid="analytics-total">{{ s.total }}</span>
            <span class="admin-muted">
              events · {{ s.from | date: 'mediumDate' }} – {{ s.to | date: 'mediumDate' }}
            </span>
          </div>
          <p class="admin-muted head__source">
            <app-admin-icon name="database" [size]="16" />
            Source: {{ s.source }} · sent to the {{ s.transport }}
          </p>
        </div>
        @let tiles = derived();
        <ul class="tiles" aria-label="Derived counts">
          <li class="tile">
            <span class="tile__label">Searches without results</span>
            <span class="tile__value">{{
              tiles.noResults.percent === null ? '—' : tiles.noResults.percent + '%'
            }}</span>
            <span class="tile__hint">{{ tiles.noResults.line }}</span>
          </li>
          <li class="tile">
            <span class="tile__label">Messages per wish added</span>
            <span class="tile__value">{{
              tiles.messagesPerWish.value === null ? '—' : tiles.messagesPerWish.value.toFixed(1)
            }}</span>
            <span class="tile__hint">{{ tiles.messagesPerWish.line }}</span>
          </li>
        </ul>

        @if (s.total === 0) {
          <app-empty-state
            icon="monitoring"
            title="No events in this period"
            description="Events appear as collectors search, view cards and message each other."
          />
        } @else {
          <section class="admin-card" aria-labelledby="analytics-daily">
            <h2 id="analytics-daily">Events per day</h2>
            <div class="columns" role="list" aria-label="Events per day">
              @for (day of dailyCounts(); track day.day) {
                <div
                  class="column"
                  role="listitem"
                  [attr.aria-label]="(day.day | date: 'mediumDate') + ': ' + day.count + ' events'"
                >
                  <span
                    class="column__bar"
                    [style.height.%]="day.percent"
                    [title]="day.count + ' events'"
                  ></span>
                  <span class="column__label" aria-hidden="true">{{
                    day.day | date: 'd MMM'
                  }}</span>
                </div>
              }
            </div>
            <details class="numbers">
              <summary>Show the numbers</summary>
              <table class="numbers__table" aria-label="Events per day, in numbers">
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Events</th>
                  </tr>
                </thead>
                <tbody>
                  @for (day of dailyCounts(); track day.day) {
                    <tr>
                      <th scope="row">{{ day.day | date: 'EEE, MMM d' }}</th>
                      <td>{{ day.count.toLocaleString('en-US') }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </details>
          </section>

          <section class="admin-card totals" aria-labelledby="analytics-types">
            <h2 id="analytics-types">By event</h2>
            <p class="admin-muted">Largest first · {{ s.total.toLocaleString('en-US') }} events</p>
            <ul class="bars">
              @for (event of totals(); track event.type) {
                <li class="bar">
                  <span class="bar__label">{{ event.label }}</span>
                  <span class="bar__track" aria-hidden="true">
                    <span class="bar__fill" [style.width.%]="event.percent"></span>
                  </span>
                  <span class="bar__value">{{ event.count }}</span>
                  <span class="bar__share">{{ share(event.count, s.total) }}</span>
                </li>
              }
            </ul>
          </section>
          <p class="admin-muted analytics__note">
            This page shows counts per day and kind only. The events behind them never carry text, a
            name, a handle or an email; their labels are at most a game, a report reason, the region
            and the state or province.
          </p>
        }
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading analytics</span>
          <app-skeleton height="80px" />
          <app-skeleton height="220px" />
        </div>
      }
    </div>
  `,
  styleUrls: [
    '../shared/admin-page.scss',
    '../console/console-page.scss',
    '../console/console-controls.scss',
  ],
  styles: `
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
      margin: 0 0 16px;
      padding: 0;
      list-style: none;
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 16px;
      border: 1px solid var(--color-border);
      border-radius: 16px;
      background: var(--color-surface);
    }
    .tile__label,
    .tile__hint {
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .tile__value {
      color: var(--color-ink);
      font-family: var(--font-display);
      font-size: 28px;
      font-weight: var(--font-weight-bold);
    }
    .analytics__note {
      margin-top: 16px;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-4);
    }
    .head__total {
      display: flex;
      flex-direction: column;
    }
    .head__value {
      font-family: var(--font-display);
      font-size: var(--font-size-4xl);
      font-weight: var(--font-weight-bold);
      line-height: 1;
    }
    .head__source {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .head__source mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .columns {
      display: flex;
      align-items: stretch;
      gap: 4px;
      height: 180px;
      overflow-x: auto;
    }
    .column {
      display: flex;
      flex: 1 0 18px;
      flex-direction: column;
      justify-content: flex-end;
      align-items: center;
      gap: 4px;
    }
    .column__bar {
      width: 100%;
      min-height: 2px;
      border-radius: var(--radius-sm) var(--radius-sm) 0 0;
      background: var(--color-primary);
      transition: height var(--motion-duration-slow) var(--motion-easing-standard);
    }
    .column__label {
      color: var(--color-text-muted);
      font-size: 10px;
      white-space: nowrap;
    }
    .totals {
      margin-top: var(--spacing-4);
    }
    .bars {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .bar {
      display: grid;
      grid-template-columns: minmax(170px, auto) 1fr 3.5em 3em;
      align-items: center;
      gap: var(--spacing-2);
      font-size: var(--font-size-sm);
    }
    .bar__track {
      height: 8px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      overflow: hidden;
    }
    .bar__fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--color-accent);
    }
    .bar__value {
      font-weight: var(--font-weight-semibold);
      text-align: right;
    }
    .bar__share {
      color: var(--color-text-secondary);
      text-align: right;
    }
    .numbers {
      margin-top: var(--spacing-3);
      font-size: var(--font-size-sm);
    }
    .numbers summary {
      cursor: pointer;
      color: var(--color-accent);
      font-weight: var(--font-weight-semibold);
    }
    .numbers__table {
      margin-top: var(--spacing-2);
      border-collapse: collapse;
    }
    .numbers__table th,
    .numbers__table td {
      padding: 4px var(--spacing-3) 4px 0;
      border-bottom: 1px solid var(--color-border);
      text-align: left;
      font-weight: normal;
    }
    .numbers__table td {
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    @media (max-width: 599.98px) {
      .bar {
        grid-template-columns: minmax(0, 1fr) 3.5em 3em;
      }
      .bar__track {
        display: none;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .column__bar {
        transition: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAnalyticsPageComponent {
  private readonly api = inject(AdminAnalyticsService);

  protected readonly periods = PERIODS;
  protected readonly days = signal<number>(7);
  protected readonly summary = signal<AnalyticsSummary | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly totals = computed(() => eventTotals(this.summary()));
  protected readonly share = shareWords;
  protected readonly dailyCounts = computed(() => dailyTotals(this.summary()));
  protected readonly derived = computed(() => derivedTiles(this.summary()));

  constructor() {
    this.load();
  }

  protected setDays(days: number): void {
    this.days.set(days);
    this.load();
  }

  protected load(): void {
    this.error.set(null);
    this.summary.set(null);
    this.api
      .getAnalyticsSummary({ days: this.days() }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (summary) => this.summary.set(summary),
        error: (error: unknown) => this.error.set(toApiError(error)),
      });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }
}
