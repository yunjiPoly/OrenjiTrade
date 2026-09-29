import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import type { Plan } from '@orenji/api-client';
import {
  featureLabel,
  formatLimitValue,
  formatPlanPrice,
  humanizeKey,
} from '../../shared/plans/plan-labels';

/** One plan: price, description, limits and features, with the call to action for the viewer. */
@Component({
  selector: 'app-plan-card',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <article
      class="plan"
      [class.plan--highlight]="highlight()"
      [attr.aria-labelledby]="'plan-' + plan().code"
    >
      @if (current()) {
        <span class="plan__badge">Your plan</span>
      } @else if (highlight()) {
        <span class="plan__badge plan__badge--accent">Most popular</span>
      }
      <h2 class="plan__name" [id]="'plan-' + plan().code">{{ plan().name }}</h2>
      <p class="plan__price">
        <span class="plan__amount">{{ price() }}</span>
        <span class="plan__per">/ month</span>
      </p>
      @if (plan().description) {
        <p class="plan__description">{{ plan().description }}</p>
      }

      <ul class="plan__list" [attr.aria-label]="plan().name + ' limits and features'">
        @for (limit of plan().limits ?? []; track limit.key) {
          <li class="plan__item">
            <mat-icon aria-hidden="true">{{
              limit.limit === null || limit.limit === undefined ? 'all_inclusive' : 'check'
            }}</mat-icon>
            <span class="plan__label">{{ limitText(limit.description, limit.key) }}</span>
            <strong class="plan__value">{{ value(limit.limit) }}</strong>
          </li>
        }
        @for (feature of plan().features ?? []; track feature.key) {
          <li
            class="plan__item"
            [class.plan__item--off]="isDowngrade(feature.key, feature.enabled)"
          >
            <mat-icon aria-hidden="true">{{
              isDowngrade(feature.key, feature.enabled) ? 'remove' : 'check'
            }}</mat-icon>
            <span>{{ feature.key ? label(feature.key, !!feature.enabled) : '' }}</span>
          </li>
        }
      </ul>

      <div class="plan__cta">
        @if (current()) {
          <button matButton="outlined" type="button" disabled>Current plan</button>
        } @else if (!plan().monthlyPrice) {
          @if (!signedIn()) {
            <a matButton="outlined" routerLink="/auth/sign-up">Create a free account</a>
          } @else {
            <button matButton="outlined" type="button" disabled>Included</button>
          }
        } @else {
          <button
            matButton="filled"
            type="button"
            disabled
            disabledInteractive
            matTooltip="Coming soon: subscriptions open with billing"
          >
            <mat-icon aria-hidden="true">workspace_premium</mat-icon>
            Upgrade to {{ plan().name }}
          </button>
        }
      </div>
    </article>
  `,
  styles: `
    :host {
      display: block;
    }
    .plan {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--spacing-6);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .plan--highlight {
      border: 2px solid var(--color-primary);
      box-shadow: var(--elevation-menu);
    }
    .plan__badge {
      align-self: flex-start;
      margin-bottom: var(--spacing-2);
      padding: 2px var(--spacing-3);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .plan__badge--accent {
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .plan__name {
      font-size: var(--font-size-2xl);
    }
    .plan__price {
      margin: var(--spacing-2) 0;
    }
    .plan__amount {
      font-family: var(--font-display);
      font-size: var(--font-size-4xl);
      font-weight: var(--font-weight-semibold);
    }
    .plan__per,
    .plan__muted {
      color: var(--color-text-muted);
    }
    .plan__description {
      color: var(--color-text-muted);
    }
    .plan__list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: var(--spacing-2) 0 var(--spacing-5);
      padding: 0;
      list-style: none;
    }
    .plan__item {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-2);
      font-size: var(--font-size-sm);
    }
    .plan__item mat-icon {
      flex: 0 0 auto;
      width: 20px;
      height: 20px;
      font-size: 20px;
      color: var(--color-success);
    }
    .plan__label {
      flex: 1 1 auto;
    }
    .plan__value {
      flex: 0 0 auto;
      font-variant-numeric: tabular-nums;
    }
    .plan__item--off {
      color: var(--color-text-muted);
    }
    .plan__item--off mat-icon {
      color: var(--color-text-muted);
    }
    .plan__cta {
      margin-top: auto;
    }
    .plan__cta > * {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanCardComponent {
  readonly plan = input.required<Plan>();
  readonly current = input(false);
  readonly highlight = input(false);
  readonly signedIn = input(false);

  protected readonly price = computed(() =>
    formatPlanPrice(this.plan().monthlyPrice, this.plan().currency, 'en-CA', false),
  );
  protected readonly value = formatLimitValue;
  protected readonly label = featureLabel;

  protected limitText(description: string | undefined, key: string | undefined): string {
    return description || humanizeKey(key ?? '');
  }

  /** Features that are a restriction for the viewer (ads shown, advanced filters missing). */
  protected isDowngrade(key: string | undefined, enabled: boolean | undefined): boolean {
    return key === 'ads.enabled' ? !!enabled : !enabled;
  }
}
