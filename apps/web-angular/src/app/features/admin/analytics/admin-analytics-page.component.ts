import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { AdminAnalyticsService, AnalyticsSummary } from '@orenji/api-client';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { dailyTotals, eventTotals } from './analytics-summary';

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
    MatButtonToggleModule,
    MatIconModule,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Analytics"
        subtitle="How collectors use OrenjiTrade: searches, views, messages, wishes and reports. Counts only, never personal data or positions."
      >
        <mat-button-toggle-group
          actions
          [value]="days()"
          aria-label="Period"
          (change)="setDays($event.value)"
        >
          @for (period of periods; track period) {
            <mat-button-toggle [value]="period">{{ period }} days</mat-button-toggle>
          }
        </mat-button-toggle-group>
      </app-page-header>

      @if (error(); as error) {
        <app-error-state
          title="Analytics could not load"
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
            <mat-icon aria-hidden="true">database</mat-icon>
            Source: {{ s.source }} · transport {{ s.transport }}
          </p>
        </div>

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
          </section>

          <section class="admin-card totals" aria-labelledby="analytics-types">
            <h2 id="analytics-types">By event</h2>
            <ul class="bars">
              @for (event of totals(); track event.type) {
                <li class="bar">
                  <span class="bar__label">{{ event.label }}</span>
                  <span class="bar__track" aria-hidden="true">
                    <span class="bar__fill" [style.width.%]="event.percent"></span>
                  </span>
                  <span class="bar__value">{{ event.count }}</span>
                </li>
              }
            </ul>
          </section>
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
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
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
      grid-template-columns: minmax(170px, auto) 1fr 3.5em;
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
  protected readonly dailyCounts = computed(() => dailyTotals(this.summary()));

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
