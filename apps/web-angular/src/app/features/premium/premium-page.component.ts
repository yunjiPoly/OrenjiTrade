import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MyPlan, PlansService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { FEATURE, FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { ApiError, toApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { silentErrors } from '../../core/http/http-context';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { formatLimitValue, humanizeKey } from '../../shared/plans/plan-labels';
import { PlansStore } from '../../shared/plans/plans.store';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { PlanCardComponent } from './plan-card.component';

/**
 * `/premium`: the plans (`GET /plans`) side by side and, for signed-in collectors, their current
 * usage (`GET /me/plan`). Checkout arrives with billing; until then the upgrade button explains
 * it is coming. Hidden while the `premiumPlans` flag is off.
 */
@Component({
  selector: 'app-premium-page',
  imports: [
    DatePipe,
    MatIconModule,
    RelativeTimePipe,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    PlanCardComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="page premium">
      <app-page-header
        title="Premium"
        subtitle="More binder views and alerts, a wider map radius, advanced filters and no ads."
      />

      @if (flags.status() === 'idle' || flags.status() === 'loading') {
        <div class="premium__plans" aria-busy="true">
          <span class="visually-hidden">Loading plans</span>
          <app-skeleton variant="card" />
          <app-skeleton variant="card" />
        </div>
      } @else if (!premiumEnabled()) {
        <app-empty-state
          icon="workspace_premium"
          title="Premium is not available yet"
          description="Every collector uses the free plan for now. We will let you know when Premium opens."
        />
      } @else if (plans.error(); as error) {
        <app-error-state
          title="Plans could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="plans.load(true)"
        />
      } @else if (plans.plans(); as list) {
        @if (list.length === 0) {
          <app-empty-state icon="workspace_premium" title="No plans are offered right now" />
        } @else {
          <div class="premium__plans">
            @for (plan of list; track plan.code) {
              <app-plan-card
                [plan]="plan"
                [current]="currentPlan() === plan.code"
                [highlight]="plan.code === 'PREMIUM'"
                [signedIn]="auth.isAuthenticated()"
              />
            }
          </div>
        }
      } @else {
        <div class="premium__plans" aria-busy="true">
          <span class="visually-hidden">Loading plans</span>
          <app-skeleton variant="card" />
          <app-skeleton variant="card" />
        </div>
      }

      @if (auth.isAuthenticated()) {
        <section class="usage" aria-labelledby="usage-title">
          <h2 id="usage-title" class="usage__title">Your usage</h2>
          @if (usageError(); as error) {
            <app-error-state
              compact
              title="Your usage could not load"
              [message]="message(error)"
              (retry)="loadUsage()"
            />
          } @else if (usage(); as mine) {
            <ul class="usage__list">
              @for (limit of mine.limits ?? []; track limit.key) {
                <li class="usage__item">
                  <span class="usage__label">{{ limitLabel(limit.key) }}</span>
                  <span class="usage__value">
                    {{ limit.used ?? 0 }} / {{ value(limit.limit) }}
                  </span>
                  @if (limit.limit !== null && limit.limit !== undefined && limit.limit > 0) {
                    <span class="usage__bar" aria-hidden="true">
                      <span
                        class="usage__fill"
                        [class.usage__fill--full]="limit.allowed === false"
                        [style.width.%]="percent(limit.used, limit.limit)"
                      ></span>
                    </span>
                  }
                  @if (limit.resetsAt) {
                    <span class="usage__reset">
                      Resets {{ limit.resetsAt | relativeTime }} ({{
                        limit.resetsAt | date: 'short'
                      }})
                    </span>
                  }
                </li>
              }
            </ul>
          } @else {
            <app-skeleton variant="list" lines="3" />
          }
        </section>
      }
    </div>
  `,
  styles: `
    .premium__plans {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--spacing-5);
      max-width: 880px;
    }
    .usage {
      max-width: 880px;
      margin-top: var(--spacing-10);
    }
    .usage__title {
      margin-bottom: var(--spacing-3);
      font-size: var(--font-size-xl);
    }
    .usage__list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: var(--spacing-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .usage__item {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--spacing-1) var(--spacing-2);
      padding: var(--spacing-3) var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .usage__label {
      font-size: var(--font-size-sm);
    }
    .usage__value {
      font-weight: var(--font-weight-semibold);
      font-variant-numeric: tabular-nums;
    }
    .usage__bar {
      flex: 1 0 100%;
      height: 6px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      overflow: hidden;
    }
    .usage__fill {
      display: block;
      height: 100%;
      background: var(--color-primary);
    }
    .usage__fill--full {
      background: var(--color-danger);
    }
    .usage__reset {
      flex: 1 0 100%;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PremiumPageComponent {
  private readonly plansApi = inject(PlansService);
  private readonly session = inject(SessionService);
  protected readonly auth = inject(AuthService);
  protected readonly flags = inject(FeatureFlagsService);
  protected readonly plans = inject(PlansStore);

  protected readonly premiumEnabled = this.flags.enabled(FEATURE.premiumPlans);
  protected readonly usage = signal<MyPlan | null>(null);
  protected readonly usageError = signal<ApiError | null>(null);
  protected readonly currentPlan = computed(
    () => this.usage()?.plan?.code ?? this.session.me()?.plan ?? null,
  );
  protected readonly value = formatLimitValue;

  constructor() {
    void this.plans.load();
    effect(() => {
      if (this.auth.isAuthenticated()) {
        untracked(() => void this.loadUsage());
      } else {
        this.usage.set(null);
      }
    });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected limitLabel(key: string | undefined): string {
    return this.plans.limitDescription(key ?? '') ?? humanizeKey(key ?? '');
  }

  protected percent(used: number | undefined, limit: number): number {
    return Math.min(100, Math.round(((used ?? 0) / limit) * 100));
  }

  protected async loadUsage(): Promise<void> {
    this.usageError.set(null);
    try {
      this.usage.set(
        await firstValueFrom(this.plansApi.getMyPlan('body', false, { context: silentErrors() })),
      );
    } catch (error) {
      this.usageError.set(toApiError(error));
    }
  }
}
