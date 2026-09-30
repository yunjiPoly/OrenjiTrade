import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { FEATURE, FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { ApiError, isApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { ActiveBoostsComponent } from '../../shared/billing/active-boosts.component';
import { isEntitling } from '../../shared/billing/billing-labels';
import { humanizeKey } from '../../shared/plans/plan-labels';
import { PlansStore } from '../../shared/plans/plans.store';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../shared/ui/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { PremiumStore } from './data/premium.store';
import { PlanCardComponent } from './plan-card.component';
import { SubscriptionCardComponent } from './subscription-card.component';
import { usageRows } from './usage-meters';
import { UsageMetersComponent } from './usage-meters.component';

/**
 * `/premium`: the plans (`GET /plans`) side by side and, for signed-in members, their live
 * subscription, usage and active boosts (`GET /me/plan`). "Upgrade" opens a checkout at the
 * billing provider (the local fake checkout `/checkout/fake-billing/:ref`); the subscription can
 * be cancelled at the period end or at once. The limit-reached dialog's "See Premium" lands here.
 * Hidden while the `premiumPlans` flag is off (a live subscription stays manageable).
 */
@Component({
  selector: 'app-premium-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    ActiveBoostsComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    PlanCardComponent,
    SkeletonComponent,
    SubscriptionCardComponent,
    UsageMetersComponent,
  ],
  providers: [PremiumStore],
  template: `
    <div class="page premium">
      <app-page-header
        title="Premium"
        subtitle="More binder views and alerts, a wider map radius, advanced filters and no ads."
      />

      @if (welcome()) {
        <p class="premium__welcome" role="status" data-testid="premium-welcome">
          <mat-icon aria-hidden="true">celebration</mat-icon>
          <span>
            <strong>Welcome to Premium!</strong> Your new limits apply right away. Thank you for
            supporting OrenjiTrade.
          </span>
        </p>
      }
      @if (checkoutError(); as problem) {
        <p class="premium__problem" role="alert">
          <mat-icon aria-hidden="true">error</mat-icon>
          {{ problem }}
        </p>
      }

      @if (flags.status() === 'idle' || flags.status() === 'loading') {
        <div class="premium__plans" aria-busy="true">
          <span class="visually-hidden">Loading plans</span>
          <app-skeleton variant="card" />
          <app-skeleton variant="card" />
        </div>
      } @else if (!premiumEnabled() && !subscription()) {
        <app-empty-state
          icon="workspace_premium"
          title="Premium is not available yet"
          description="Every collector uses the free plan for now. We will let you know when Premium opens."
        />
      } @else {
        @if (subscription(); as live) {
          <app-subscription-card
            class="premium__subscription"
            [subscription]="live"
            [busy]="store.busy() !== null"
            (cancelAtPeriodEnd)="cancel(true)"
            (cancelNow)="cancel(false)"
          />
        }

        @if (premiumEnabled()) {
          @if (plans.error(); as error) {
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
                    [busy]="upgrading() === plan.code"
                    [checkoutUrl]="openCheckout(plan.code)"
                    [locked]="lockedBy(plan.code)"
                    (upgrade)="upgrade($event)"
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
        }
      }

      @if (auth.isAuthenticated()) {
        <section class="premium__section" aria-labelledby="usage-title">
          <h2 id="usage-title" class="premium__title">Your usage</h2>
          @if (store.error(); as error) {
            <app-error-state
              compact
              title="Your usage could not load"
              [message]="message(error)"
              (retry)="store.load()"
            />
          } @else if (store.myPlan(); as mine) {
            <app-usage-meters [rows]="usage()" />
            @if ((mine.entitlements ?? []).length) {
              <h3 class="premium__subtitle">Active boosts</h3>
              <app-active-boosts [entitlements]="mine.entitlements ?? []" />
            }
          } @else {
            <app-skeleton variant="list" lines="3" />
          }
        </section>

        @if (creditsEnabled() && currentPlan() !== 'PREMIUM') {
          <aside class="premium__credits" aria-label="Credits">
            <mat-icon aria-hidden="true">toll</mat-icon>
            <p>
              <strong>Only need it for a day?</strong>
              Unlock advanced filters, unlimited binder views or a wider map for 24 hours with your
              OrenjiTrade credits.
            </p>
            <a matButton="tonal" routerLink="/credits">Use credits</a>
          </aside>
        }
      }
    </div>
  `,
  styles: `
    .premium {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-6);
    }
    .premium > * {
      max-width: 880px;
    }
    .premium__plans {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--spacing-5);
    }
    .premium__welcome,
    .premium__problem {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-3);
      margin: 0;
      padding: var(--spacing-3) var(--spacing-4);
      border-radius: var(--radius-md);
    }
    .premium__welcome {
      border: 1px solid color-mix(in srgb, var(--color-success) 40%, transparent);
      background: color-mix(in srgb, var(--color-success) 12%, var(--color-surface));
    }
    .premium__welcome mat-icon {
      color: var(--color-success);
    }
    .premium__problem {
      border: 1px solid color-mix(in srgb, var(--color-danger) 40%, transparent);
      background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface));
    }
    .premium__problem mat-icon {
      color: var(--color-danger);
    }
    .premium__title {
      margin-bottom: var(--spacing-3);
      font-size: var(--font-size-xl);
    }
    .premium__subtitle {
      margin: var(--spacing-5) 0 var(--spacing-3);
      font-size: var(--font-size-lg);
    }
    .premium__credits {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-3) var(--spacing-4);
      padding: var(--spacing-4) var(--spacing-5);
      border: 1px dashed var(--color-border-strong);
      border-radius: var(--radius-lg);
    }
    .premium__credits mat-icon {
      color: var(--color-accent);
    }
    .premium__credits p {
      flex: 1 1 260px;
      margin: 0;
      color: var(--color-text-muted);
    }
    .premium__credits strong {
      color: var(--color-ink);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PremiumPageComponent {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);
  protected readonly flags = inject(FeatureFlagsService);
  protected readonly plans = inject(PlansStore);
  protected readonly store = inject(PremiumStore);

  /** `?checkout=success` after the fake billing checkout. */
  readonly checkout = input<string | undefined>();

  protected readonly premiumEnabled = this.flags.enabled(FEATURE.premiumPlans);
  protected readonly creditsEnabled = this.flags.enabled(FEATURE.credits);
  protected readonly upgrading = signal<string | null>(null);
  protected readonly checkoutError = signal<string | null>(null);
  protected readonly subscription = this.store.subscription;
  protected readonly currentPlan = computed(
    () => this.store.planCode() ?? this.session.me()?.plan ?? null,
  );
  protected readonly welcome = computed(
    () =>
      this.checkout() === 'success' && this.currentPlan() !== null && this.currentPlan() !== 'FREE',
  );
  protected readonly usage = computed(() =>
    usageRows(
      this.store.myPlan()?.limits,
      (key) => this.plans.limitDescription(key) ?? humanizeKey(key),
    ),
  );

  constructor() {
    void this.plans.load();
    effect(() => {
      if (this.auth.isAuthenticated()) {
        untracked(() => void this.store.load());
      } else {
        untracked(() => this.store.clear());
      }
    });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  /** Same-app path of the open checkout of `planCode`, if any. */
  protected openCheckout(planCode: string | undefined): string | null {
    const live = this.subscription();
    return live?.status === 'PENDING' && live.planCode === planCode && live.checkoutUrl
      ? live.checkoutUrl
      : null;
  }

  /** A live subscription of another plan blocks switching (the API answers 409). */
  protected lockedBy(planCode: string | undefined): boolean {
    const live = this.subscription();
    return !!live && isEntitling(live.status) && live.planCode !== planCode;
  }

  protected async upgrade(planCode: string): Promise<void> {
    this.checkoutError.set(null);
    this.upgrading.set(planCode);
    const result = await this.store.startCheckout(planCode);
    this.upgrading.set(null);
    if (!result.ok) {
      this.checkoutError.set(result.message);
      return;
    }
    if (result.target.kind === 'app') {
      await this.router.navigateByUrl(result.target.path);
    } else {
      window.location.assign(result.target.url);
    }
  }

  protected async cancel(atPeriodEnd: boolean): Promise<void> {
    const live = this.subscription();
    if (!live) {
      return;
    }
    const pending = live.status === 'PENDING';
    const end = live.currentPeriodEnd
      ? new Date(live.currentPeriodEnd).toLocaleDateString('en-CA', { dateStyle: 'long' })
      : null;
    const data: ConfirmDialogData = pending
      ? {
          title: 'Close the open checkout?',
          message: 'Nothing was charged. You can start a new checkout from the plans any time.',
          confirmLabel: 'Close the checkout',
          cancelLabel: 'Keep it open',
        }
      : atPeriodEnd
        ? {
            title: 'Cancel Premium at the end of the period?',
            message: end
              ? `Premium stays until ${end}. After that you are back on the free plan and its limits.`
              : 'Premium stays until the end of the paid period, then you are back on the free plan.',
            confirmLabel: 'Cancel at period end',
            cancelLabel: 'Keep Premium',
          }
        : {
            title: 'Cancel Premium now?',
            message:
              'Premium ends right away and the free plan’s limits apply at once (binders, wishlist, map radius and ads).',
            confirmLabel: 'Cancel now',
            cancelLabel: 'Keep Premium',
            tone: 'danger',
          };
    const confirmed = await new Promise<boolean>((resolve) =>
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, { data })
        .afterClosed()
        .subscribe((answer) => resolve(answer === true)),
    );
    if (!confirmed) {
      return;
    }
    const result = await this.store.cancel(pending ? false : atPeriodEnd);
    if (isApiError(result)) {
      this.snackBar.open(
        result.status === 404 ? 'There is no subscription to cancel.' : friendlyMessage(result),
        'OK',
        { duration: 6000 },
      );
      return;
    }
    await this.session.load();
    this.snackBar.open(
      pending
        ? 'The checkout is closed.'
        : result.status === 'CANCELLED' || result.status === 'EXPIRED'
          ? 'Premium is cancelled. You are on the free plan now.'
          : end
            ? `Premium is cancelled and ends on ${end}.`
            : 'Premium is cancelled at the end of the period.',
      'OK',
      { duration: 6000 },
    );
  }
}
