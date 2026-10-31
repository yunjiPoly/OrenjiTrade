import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  AdminUsageLimit,
  AdminUsageLimitsService,
  UpdateUsageLimitRequestWindowEnum,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { limitLabel, windowLabel } from '../../../shared/limits/limit-labels';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { LimitCellComponent, LimitEdit } from './limit-cell.component';
import { ToastService } from '../../../core/feedback/toast.service';
import { AdminIconComponent } from '../console/admin-icon.component';
import { RECORDED } from '../console/console-actions';
import { changedLine } from '../console/editor-line';
import { groupLimits, replaceLimit } from './limit-rows';

/** What each limit counts (board A14). */
const HELP: Readonly<Record<string, string>> = {
  'binder.views.per_day': 'Public binders a collector can open in a day.',
  'binders.max': 'Binders a collector can have at once.',
  'inventory.items.max': 'Cards a collector can keep in their inventory.',
  'wishlist.items.max': 'Cards a collector can wish for at once.',
  'wishlist.alerts.per_day': 'Wishlist match alerts a collector gets in a day.',
  'offers.per_day': 'Offers a collector can send in a day.',
};

/**
 * `/admin/usage-limits`: one usage limit per key, the same for every collector (stage F1: no
 * plans), with inline editing (SUPER_ADMIN). A saved value applies to every collector at once
 * (cache evicted) and is audited; counters keep their usage.
 */
@Component({
  selector: 'app-admin-usage-limits-page',
  imports: [
    AdminIconComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    LimitCellComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="cp">
      <header class="cp__head">
        <div class="cp__heading">
          <p class="cp__eyebrow">Rules</p>
          <h1 class="cp__title">Usage limits</h1>
          <p class="cp__sub">
            What every collector can do. The same for everyone; edits apply right away and are
            audited.
          </p>
        </div>
      </header>

      <p class="ul__info" role="note">
        <app-admin-icon name="info" [size]="18" />
        Counters reset at 00:00 UTC. Signed-out visitors are only limited by address: 60 requests a
        minute.
      </p>
      @if (!session.isSuperAdmin()) {
        <p class="ul__info ul__lock" role="note">
          <app-admin-icon name="lock" [size]="18" />
          Only super admins can change usage limits. You can review them here.
        </p>
      }

      @if (error(); as error) {
        <app-error-state
          title="Usage limits could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          retryLabel="Try again"
          (retry)="load()"
        />
      } @else if (groups(); as groups) {
        @if (groups.length === 0) {
          <app-empty-state icon="speed" title="No usage limits are configured" />
        } @else {
          <div class="ul">
            <div class="ul__main">
              @for (group of groups; track group.id) {
                <section class="cp-card ul__group" [attr.aria-labelledby]="'ul-' + group.id">
                  <div class="ul__group-head">
                    <h2 class="cp-card__title" [id]="'ul-' + group.id">{{ group.label }}</h2>
                    <span class="cp-muted"
                      >{{ group.limits.length }}
                      {{ group.limits.length === 1 ? 'limit' : 'limits' }}</span
                    >
                  </div>
                  <ul class="cp-rows">
                    @for (row of group.limits; track row.id) {
                      <li class="ul__row" [attr.data-limit]="row.key">
                        <div class="ul__text">
                          <p class="ul__name">{{ name(row) }}</p>
                          <p class="ul__desc">{{ help(row) }}</p>
                          <p class="ul__meta">
                            <code class="cp-mono">{{ row.key }}</code>
                            <span class="cp-chip">{{
                              row.kind === 'CAP' ? 'Cap' : 'Counter'
                            }}</span>
                            <span class="cp-chip">{{ windowName(row.window) }}</span>
                          </p>
                          @if (group.note) {
                            <p class="ul__note">{{ group.note }}</p>
                          }
                          <p class="ul__changed">{{ changed(row) }}</p>
                        </div>
                        <div class="ul__value">
                          <app-limit-cell
                            [limit]="row"
                            [label]="name(row)"
                            [canEdit]="session.isSuperAdmin()"
                            [saving]="savingId() === row.id"
                            (edit)="save($event)"
                          />
                        </div>
                      </li>
                    }
                  </ul>
                </section>
              }
            </div>
            <aside class="ul__side" aria-label="How a limit reads">
              <section class="cp-card ul__how" aria-labelledby="ul-how">
                <h2 class="cp-card__title" id="ul-how">How a limit reads</h2>
                <dl>
                  <div>
                    <dt><span class="cp-chip">Counter</span> <span class="cp-chip">Daily</span></dt>
                    <dd>Counts what a collector does in a day. It starts again at 00:00 UTC.</dd>
                  </div>
                  <div>
                    <dt><span class="cp-chip">Counter</span> <span class="cp-chip">Total</span></dt>
                    <dd>Counts what a collector keeps at once, like binders or wishes.</dd>
                  </div>
                  <div>
                    <dt><span class="cp-chip">Unlimited</span></dt>
                    <dd>Nothing is counted against it.</dd>
                  </div>
                </dl>
              </section>
              <p class="cp-muted ul__after">
                A saved value applies to every collector at once. What they already used today still
                counts.
              </p>
            </aside>
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
  styleUrls: ['../console/console-page.scss', '../console/console-controls.scss'],
  styles: `
    .ul__info {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 16px;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--color-accent-tint);
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
    .ul__lock {
      background: var(--color-surface-variant);
      color: var(--color-text-secondary);
    }
    .ul__group {
      margin-bottom: 18px;
      padding: 8px 0 0;
    }
    .ul__group-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 10px 20px;
      font-size: var(--font-size-sm);
    }
    .ul__row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 24px;
      padding: 14px 20px;
    }
    .ul__text {
      flex: 1 1 360px;
      min-width: 0;
    }
    .ul__text p {
      margin: 0;
    }
    .ul__name {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .ul__desc,
    .ul__changed,
    .ul__note {
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .ul__changed {
      margin-top: 4px !important;
      font-size: var(--font-size-xs);
    }
    .ul__note {
      margin-top: 6px !important;
      color: var(--app-warning-text);
    }
    .ul__meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-top: 6px !important;
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }
    .ul__value {
      flex: 0 1 280px;
      min-width: 220px;
    }
    /* Board A14: "How a limit reads" in a side column at lg, under the list below 1280 (web stage
       WH2 review fix 2). */
    .ul {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 300px;
      gap: 24px;
      align-items: start;
    }
    .ul__main {
      min-width: 0;
    }
    .ul__side {
      position: sticky;
      top: 16px;
    }
    .ul__after {
      margin: 12px 4px 0;
      font-size: var(--font-size-sm);
    }
    @media (max-width: 1279.98px) {
      .ul {
        grid-template-columns: 1fr;
      }
      .ul__side {
        position: static;
      }
    }
    .ul__how {
      padding: 18px 20px;
    }
    .ul__how dl {
      display: grid;
      gap: 10px;
      margin: 12px 0;
    }
    .ul__how div {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 12px;
    }
    .ul__how dd {
      margin: 0;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsageLimitsPageComponent {
  private readonly api = inject(AdminUsageLimitsService);
  private readonly toasts = inject(ToastService);
  protected readonly session = inject(SessionService);

  private readonly limits = signal<AdminUsageLimit[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly savingId = signal<string | null>(null);
  protected readonly groups = computed(() => {
    const limits = this.limits();
    return limits ? groupLimits(limits) : null;
  });
  protected readonly windowName = windowLabel;

  /** What the limit counts (board A14's line under its name). */
  protected help(limit: AdminUsageLimit): string {
    return HELP[limit.key ?? ''] ?? '';
  }

  /** "Changed Oct 18 by Alex Morin" (spec 15.8: a name, never an id). */
  protected changed(limit: AdminUsageLimit): string {
    return changedLine(limit, 'Changed');
  }

  constructor() {
    void this.load();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  /** The row's description, else the readable name of its key. */
  protected name(limit: AdminUsageLimit): string {
    return limit.description || limitLabel(limit.key ?? '');
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      const limits = await firstValueFrom(
        this.api.listUsageLimits('body', false, { context: silentErrors() }),
      );
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
      this.toasts.show({
        title: `${updated.key} is now ${value} for every collector.`,
        sub: RECORDED,
      });
    } catch (error) {
      const apiError = toApiError(error);
      this.toasts.show({
        title: friendlyMessage(apiError),
        sub: apiError.requestId ? `Request ${apiError.requestId}` : null,
        tone: 'error',
      });
    } finally {
      this.savingId.set(null);
    }
  }
}
