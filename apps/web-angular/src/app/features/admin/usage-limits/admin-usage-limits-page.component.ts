import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AdminPlan,
  AdminPlansService,
  AdminUsageLimit,
  UpdateUsageLimitRequestWindowEnum,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { windowLabel } from '../../../shared/plans/plan-labels';
import { PlansStore } from '../../../shared/plans/plans.store';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { LimitCellComponent, LimitEdit } from './limit-cell.component';
import { buildLimitMatrix, replaceLimit } from './limit-matrix';

/**
 * `/admin/usage-limits`: plans x limits with inline editing (SUPER_ADMIN). A saved value applies
 * to every instance at once (cache evicted) and is audited; counters keep their usage.
 */
@Component({
  selector: 'app-admin-usage-limits-page',
  imports: [
    MatIconModule,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
    LimitCellComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Usage limits"
        subtitle="What each plan allows. Edits apply live to every collector and are audited."
      />

      @if (!session.isSuperAdmin()) {
        <p class="limits__note" role="note">
          <mat-icon aria-hidden="true">lock</mat-icon>
          Only super admins can change usage limits. You can review them here.
        </p>
      }

      @if (error(); as error) {
        <app-error-state
          title="Usage limits could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="load()"
        />
      } @else if (matrix(); as matrix) {
        @if (matrix.rows.length === 0) {
          <app-empty-state icon="speed" title="No usage limits are configured" />
        } @else {
          <div
            class="limits__wrap"
            tabindex="0"
            role="region"
            aria-label="Usage limits (scrollable)"
          >
            <table class="limits" aria-label="Usage limits by plan">
              <thead>
                <tr>
                  <th scope="col">Limit</th>
                  @for (plan of matrix.plans; track plan.code) {
                    <th scope="col">
                      {{ plan.name }}
                      @if (!plan.active) {
                        <span class="limits__inactive">inactive</span>
                      }
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of matrix.rows; track row.key) {
                  <tr [attr.data-limit]="row.key">
                    <th scope="row">
                      <div class="limits__rowhead">
                        <span class="limits__description">{{ row.description || row.key }}</span>
                        <span class="limits__key mono">{{ row.key }}</span>
                        <span class="limits__tags">
                          <span class="limits__tag">{{
                            row.kind === 'CAP' ? 'Cap' : 'Counter'
                          }}</span>
                          <span class="limits__tag">{{ windowName(row.window) }}</span>
                        </span>
                      </div>
                    </th>
                    @for (plan of matrix.plans; track plan.code) {
                      <td>
                        <app-limit-cell
                          [limit]="row.cells[plan.code]"
                          [planName]="plan.code"
                          [canEdit]="session.isSuperAdmin()"
                          [saving]="savingId() === row.cells[plan.code]?.id"
                          (edit)="save($event)"
                        />
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading usage limits</span>
          <app-skeleton variant="list" lines="7" />
        </div>
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .limits__note {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      padding: var(--spacing-3) var(--spacing-4);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    .limits__wrap {
      overflow-x: auto;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .limits {
      width: 100%;
      min-width: 640px;
      border-collapse: collapse;
    }
    th,
    td {
      padding: var(--spacing-3) var(--spacing-4);
      border-bottom: 1px solid var(--color-border);
      text-align: left;
      vertical-align: middle;
    }
    thead th {
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    tbody tr:last-child th,
    tbody tr:last-child td {
      border-bottom: 0;
    }
    td {
      min-width: 180px;
    }
    th[scope='row'] {
      font-weight: var(--font-weight-regular);
    }
    .limits__rowhead {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-weight: var(--font-weight-regular);
    }
    .limits__description {
      font-weight: var(--font-weight-semibold);
    }
    .limits__key {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .limits__tags {
      display: flex;
      gap: 4px;
    }
    .limits__tag,
    .limits__inactive {
      padding: 0 6px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      text-transform: none;
      letter-spacing: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsageLimitsPageComponent {
  private readonly api = inject(AdminPlansService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly publicPlans = inject(PlansStore);
  protected readonly session = inject(SessionService);

  private readonly plans = signal<AdminPlan[] | null>(null);
  private readonly limits = signal<AdminUsageLimit[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly savingId = signal<string | null>(null);
  protected readonly matrix = computed(() => {
    const plans = this.plans();
    const limits = this.limits();
    return plans && limits ? buildLimitMatrix(plans, limits) : null;
  });
  protected readonly windowName = windowLabel;

  constructor() {
    void this.load();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      const [plans, limits] = await Promise.all([
        firstValueFrom(this.api.listAdminPlans('body', false, { context: silentErrors() })),
        firstValueFrom(this.api.listUsageLimits({}, 'body', false, { context: silentErrors() })),
      ]);
      this.plans.set(plans ?? []);
      this.limits.set(limits ?? []);
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  protected async save(edit: LimitEdit): Promise<void> {
    const id = edit.limit.id;
    if (!id) {
      return;
    }
    this.savingId.set(id);
    try {
      const updated = await firstValueFrom(
        this.api.updateUsageLimit(
          {
            id,
            updateUsageLimitRequest: {
              unlimited: edit.unlimited,
              maxValue: edit.unlimited ? undefined : (edit.maxValue ?? undefined),
              window: edit.limit.window as UpdateUsageLimitRequestWindowEnum | undefined,
              description: edit.limit.description,
            },
          },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.limits.update((limits) => replaceLimit(limits ?? [], updated));
      const value = updated.unlimited ? 'unlimited' : String(updated.maxValue);
      this.snackBar.open(`${updated.planCode} ${updated.key} is now ${value}.`, 'OK', {
        duration: 4000,
      });
      void this.publicPlans.load(true);
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 6000 });
    } finally {
      this.savingId.set(null);
    }
  }
}
