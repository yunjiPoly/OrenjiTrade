import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { AdminPlan, AdminPlansService, UpdatePlanRequest } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import {
  featureLabel,
  formatLimitValue,
  formatPlanPrice,
  humanizeKey,
} from '../../../shared/plans/plan-labels';
import { PlansStore } from '../../../shared/plans/plans.store';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { runAdminAction } from '../shared/admin-actions';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { PlanDialogComponent } from './plan-dialog.component';

/**
 * `/admin/plans` (ADMIN reads, SUPER_ADMIN edits): every plan with its price, features and
 * limits (`GET /admin/plans`); "Edit" changes the name, description, display price, availability,
 * order and feature switches (audited `plan.update`). Limit values live in Usage limits.
 */
@Component({
  selector: 'app-admin-plans-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    AdminChipComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Plans"
        subtitle="Prices and feature switches of the plans members see on the Premium page."
      >
        <a actions matButton="outlined" routerLink="/admin/usage-limits">
          <mat-icon aria-hidden="true">speed</mat-icon>
          Usage limits
        </a>
      </app-page-header>
      @if (error(); as error) {
        <app-error-state title="Plans could not load" [message]="message(error)" (retry)="load()" />
      } @else if (plans(); as list) {
        <div class="plans">
          @for (plan of list; track plan.code) {
            <article class="admin-card plan" [attr.aria-labelledby]="'admin-plan-' + plan.code">
              <div class="billing-head">
                <div>
                  <h2 [id]="'admin-plan-' + plan.code">{{ plan.name }}</h2>
                  <span class="admin-muted">{{ plan.code }} · order {{ plan.sortOrder }}</span>
                </div>
                <app-admin-chip [tone]="plan.active ? 'success' : 'neutral'">{{
                  plan.active ? 'Offered' : 'Hidden'
                }}</app-admin-chip>
              </div>
              <p class="plan__price" data-testid="admin-plan-price">
                {{ price(plan) }} <span class="admin-muted">/ month</span>
              </p>
              @if (plan.description) {
                <p class="admin-muted">{{ plan.description }}</p>
              }
              <h3>Features</h3>
              <ul class="plan__list">
                @for (feature of plan.features ?? []; track feature.key) {
                  <li class="plan__feature">
                    <mat-icon aria-hidden="true">{{
                      feature.enabled ? 'toggle_on' : 'toggle_off'
                    }}</mat-icon>
                    {{ featureName(feature.key) }}: {{ feature.enabled ? 'on' : 'off' }}
                  </li>
                }
              </ul>
              <h3>Limits</h3>
              <ul class="plan__list">
                @for (limit of plan.limits ?? []; track limit.id) {
                  <li>
                    <span>{{ limit.description || limitName(limit.key) }}</span>
                    <strong>{{ value(limit.maxValue) }}</strong>
                  </li>
                }
              </ul>
              <div class="plan__foot">
                <span class="admin-muted">
                  @if (plan.updatedAt) {
                    Changed {{ plan.updatedAt | date: 'medium' }}
                  }
                </span>
                @if (session.isSuperAdmin()) {
                  <button matButton="filled" type="button" (click)="edit(plan)">
                    Edit {{ plan.name }}
                  </button>
                }
              </div>
            </article>
          }
        </div>
        @if (!session.isSuperAdmin()) {
          <p class="admin-muted">Only super admins change plans.</p>
        }
      } @else {
        <div class="plans" aria-busy="true">
          <span class="visually-hidden">Loading plans</span>
          <app-skeleton variant="card" />
          <app-skeleton variant="card" />
        </div>
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss', './admin-billing.scss'],
  styles: `
    .plans {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: var(--spacing-4);
    }
    .plan h2 {
      margin: 0;
    }
    .plan h3 {
      margin: var(--spacing-3) 0 var(--spacing-1);
      font-size: var(--font-size-sm);
    }
    .plan__price {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-2xl);
      font-weight: var(--font-weight-semibold);
    }
    .plan__list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      font-size: var(--font-size-sm);
      list-style: none;
    }
    .plan__list li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
    }
    .plan__list .plan__feature {
      justify-content: flex-start;
    }
    .plan__list mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .plan__foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
      margin-top: var(--spacing-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPlansPageComponent {
  private readonly api = inject(AdminPlansService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly publicPlans = inject(PlansStore);
  protected readonly session = inject(SessionService);

  protected readonly plans = signal<AdminPlan[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly value = formatLimitValue;

  constructor() {
    void this.load();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected price(plan: AdminPlan): string {
    return formatPlanPrice(plan.monthlyPrice, plan.currency, 'en-CA', false);
  }

  protected featureName(key: string | undefined): string {
    return featureLabel(key ?? '', true);
  }

  protected limitName(key: string | undefined): string {
    return this.publicPlans.limitDescription(key ?? '') ?? humanizeKey(key ?? '');
  }

  async load(): Promise<void> {
    this.error.set(null);
    void this.publicPlans.load();
    try {
      this.plans.set(
        (await firstValueFrom(
          this.api.listAdminPlans('body', false, { context: silentErrors() }),
        )) ?? [],
      );
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  protected edit(plan: AdminPlan): void {
    this.dialog
      .open<PlanDialogComponent, AdminPlan, UpdatePlanRequest>(PlanDialogComponent, {
        data: plan,
        panelClass: 'app-dialog--md',
      })
      .afterClosed()
      .subscribe(async (request) => {
        if (!request || !plan.code) {
          return;
        }
        const saved = await runAdminAction(
          this.snackBar,
          this.api.updatePlan({ code: plan.code, updatePlanRequest: request }, 'body', false, {
            context: silentErrors(),
          }),
          `The ${request.name} plan is saved.`,
        );
        if (saved) {
          this.plans.update((list) =>
            (list ?? []).map((entry) => (entry.code === saved.code ? saved : entry)),
          );
          void this.publicPlans.load(true);
        }
      });
  }
}
