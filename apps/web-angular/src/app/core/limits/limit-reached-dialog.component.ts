import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { formatLimitValue, humanizeKey, windowSuffix } from '../../shared/plans/plan-labels';
import { PlansStore } from '../../shared/plans/plans.store';
import { FEATURE, FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { LimitReachedInfo } from './limit-reached';

/** Opens the dialog (called lazily by `LimitReachedService`). */
export function openLimitReachedDialog(
  injector: Injector,
  info: LimitReachedInfo,
): MatDialogRef<LimitReachedDialogComponent, void> {
  return injector
    .get(MatDialog)
    .open<LimitReachedDialogComponent, LimitReachedInfo, void>(LimitReachedDialogComponent, {
      data: info,
      role: 'alertdialog',
      panelClass: 'app-dialog--md',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
}

/**
 * Explains a reached freemium limit: which limit, how much was used, when it resets and what
 * Premium changes, with a link to `/premium` (hidden while the `premiumPlans` flag is off) that
 * closes every open dialog on its way.
 */
@Component({
  selector: 'app-limit-reached-dialog',
  imports: [
    DatePipe,
    RouterLink,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    RelativeTimePipe,
  ],
  template: `
    <div class="limit__hero" aria-hidden="true">
      <mat-icon class="limit__icon">speed</mat-icon>
    </div>
    <h2 mat-dialog-title class="limit__title">You reached a plan limit</h2>
    <mat-dialog-content>
      <p class="limit__lead" data-testid="limit-summary">
        <strong>{{ label() }}</strong>
        @if (info.used !== null && info.limit !== null) {
          — you used {{ info.used }} of {{ info.limit }} {{ windowText() }}.
        } @else {
          — you cannot go further on your current plan.
        }
      </p>

      @if (percent() !== null) {
        <div class="limit__meter" aria-hidden="true">
          <span class="limit__meter-fill" [style.width.%]="percent()"></span>
        </div>
      }

      <dl class="limit__facts">
        <div class="limit__fact">
          <dt>Limit</dt>
          <dd>
            <span class="mono">{{ info.limitKey || 'unknown' }}</span>
          </dd>
        </div>
        <div class="limit__fact">
          <dt>Usage</dt>
          <dd>{{ usageText() }}</dd>
        </div>
        <div class="limit__fact">
          <dt>Resets</dt>
          <dd data-testid="limit-reset">
            @if (info.resetsAt) {
              {{ info.resetsAt | relativeTime }}
              <span class="limit__muted">({{ info.resetsAt | date: 'medium' }})</span>
            } @else {
              Does not reset on its own: it counts everything on your account.
            }
          </dd>
        </div>
        @if (info.planCode) {
          <div class="limit__fact">
            <dt>Plan</dt>
            <dd>{{ planName() }}</dd>
          </div>
        }
      </dl>

      <section class="limit__premium" aria-labelledby="limit-premium-title">
        <h3 id="limit-premium-title" class="limit__premium-title">
          <mat-icon aria-hidden="true">workspace_premium</mat-icon>
          {{ onPremium() ? 'You are on Premium' : 'With Premium' }}
        </h3>
        <p class="limit__premium-text">{{ premiumText() }}</p>
      </section>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Not now</button>
      @if (premiumEnabled()) {
        <a matButton="filled" [routerLink]="upgradeTree" (click)="leave()">
          <mat-icon aria-hidden="true">workspace_premium</mat-icon>
          See Premium
        </a>
      }
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: block;
    }
    .limit__hero {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      margin: var(--spacing-5) var(--spacing-6) 0;
      border-radius: var(--radius-pill);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .limit__icon {
      width: 30px;
      height: 30px;
      font-size: 30px;
    }
    .limit__lead {
      color: var(--color-ink);
    }
    .limit__meter {
      height: 8px;
      margin-bottom: var(--spacing-4);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      overflow: hidden;
    }
    .limit__meter-fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--color-warning), var(--color-danger));
    }
    .limit__facts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--spacing-3);
      margin: 0 0 var(--spacing-4);
    }
    .limit__fact dt {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }
    .limit__fact dd {
      margin: 2px 0 0;
      color: var(--color-ink);
    }
    .limit__muted {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .limit__premium {
      padding: var(--spacing-3) var(--spacing-4);
      border-radius: var(--radius-lg);
      border: 1px solid color-mix(in srgb, var(--color-primary) 35%, transparent);
      background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
    }
    .limit__premium-title {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin-bottom: var(--spacing-1);
      font-size: var(--font-size-md);
      color: var(--color-ink);
    }
    .limit__premium-title mat-icon {
      color: var(--color-primary);
    }
    .limit__premium-text {
      margin: 0;
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LimitReachedDialogComponent {
  protected readonly info = inject<LimitReachedInfo>(MAT_DIALOG_DATA);
  private readonly plans = inject(PlansStore);
  private readonly flags = inject(FeatureFlagsService);
  protected readonly upgradeTree = inject(Router).parseUrl(this.info.upgradeUrl);

  protected readonly premiumEnabled = this.flags.enabled(FEATURE.premiumPlans);
  protected readonly onPremium = computed(() => this.info.planCode === 'PREMIUM');

  private readonly planLimit = computed(() => {
    for (const plan of this.plans.plans() ?? []) {
      const entry = plan.limits?.find((limit) => limit.key === this.info.limitKey);
      if (entry) {
        return entry;
      }
    }
    return null;
  });

  protected readonly label = computed(
    () =>
      this.plans.limitDescription(this.info.limitKey) ??
      (this.info.limitKey ? humanizeKey(this.info.limitKey) : 'Plan limit'),
  );
  protected readonly windowText = computed(() => {
    switch (this.planLimit()?.window) {
      case 'DAY':
        return 'today';
      case 'MONTH':
        return 'this month';
      default:
        return 'on your account';
    }
  });
  protected readonly usageText = computed(() =>
    this.info.used === null
      ? `Limit ${formatLimitValue(this.info.limit)}`
      : `${this.info.used} of ${formatLimitValue(this.info.limit)}`,
  );
  protected readonly percent = computed(() => {
    const { used, limit } = this.info;
    if (used === null || limit === null) {
      return null;
    }
    return limit <= 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  });
  protected readonly planName = computed(() => {
    const code = this.info.planCode;
    return this.plans.plans()?.find((plan) => plan.code === code)?.name ?? code ?? '';
  });
  protected readonly premiumText = computed(() => {
    if (!this.premiumEnabled()) {
      return 'Premium plans are not available yet. The limit resets as shown above.';
    }
    if (this.onPremium()) {
      return 'This limit also applies to Premium. It resets as shown above; see the plans for details.';
    }
    const premium = this.plans.premium();
    const entry = premium?.limits?.find((limit) => limit.key === this.info.limitKey);
    if (entry && (entry.limit === null || entry.limit === undefined)) {
      return `Premium removes this limit, and adds a wider map radius, advanced filters and no ads.`;
    }
    if (entry?.limit !== undefined && entry.limit !== null) {
      const suffix = windowSuffix(entry.window);
      return `Premium raises it to ${entry.limit}${suffix ? ' ' + suffix : ''}, with advanced filters and no ads.`;
    }
    return 'Premium raises your limits, adds advanced filters and removes ads.';
  });

  private readonly dialog = inject(MatDialog);

  constructor() {
    void this.plans.load();
  }

  /**
   * "See Premium" leaves the page: close this dialog and the form that hit the limit (the router
   * does not close dialogs on its own), so the plans are not hidden behind it.
   */
  protected leave(): void {
    this.dialog.closeAll();
  }
}
