import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import {
  AdminConsoleService,
  AdminDashboard,
  AdminDelistingService,
  JobStatus,
  DelistPolicyResponse,
  UpdateDelistPolicyRequest,
} from '@orenji/api-client';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { confirmAdminAction } from '../shared/admin-actions';
import { ToastService } from '../../../core/feedback/toast.service';
import { AdminIconComponent } from '../console/admin-icon.component';
import { runConsoleAction } from '../console/console-actions';
import { changedLine } from '../console/editor-line';
import { DelistPolicyEditorComponent } from './delist-policy-editor.component';

/**
 * `/admin/auto-delist-rules` (administrators): the auto-delist policy (`GET/PUT
 * /admin/delist-policies`): when public listings age, go stale and are hidden, the warning before
 * hiding, and how many unanswered conversations pause a collector's listings. Nothing is ever
 * deleted; every change is audited and applies from the next hourly run.
 */
@Component({
  selector: 'app-admin-delist-rules-page',
  imports: [
    DatePipe,
    RouterLink,
    AdminIconComponent,
    DelistPolicyEditorComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="cp">
      <header class="cp__head">
        <div class="cp__heading">
          <p class="cp__eyebrow">Rules</p>
          <h1 class="cp__title">Auto-delist</h1>
          <p class="cp__sub">
            Keep discovery trustworthy: listings nobody confirms fade out, and collectors who stop
            answering pause until they are back. Nothing is ever deleted.
          </p>
        </div>
      </header>
      @if (error(); as error) {
        <app-error-state
          title="The rules could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          retryLabel="Try again"
          (retry)="load()"
        />
      } @else if (policies(); as list) {
        @if (list.length === 0) {
          <app-empty-state
            icon="auto_delete"
            title="No policy"
            description="No auto-delist policy exists."
          />
        } @else {
          <div class="ad">
            <div class="ad__main">
              @for (policy of list; track policy.id) {
                <section class="cp-card ad__card" [attr.aria-label]="'Policy ' + policy.name">
                  <app-delist-policy-editor
                    [policy]="policy"
                    [busy]="busy() === policy.id"
                    (save)="save(policy, $event)"
                  />
                  <p class="ad__meta">
                    <app-admin-icon name="clock" [size]="16" />
                    {{ changed(policy) }} · applies from the next hourly freshness run
                  </p>
                </section>
              }
            </div>
            <aside class="ad__side">
              <section class="cp-card ad__card" aria-labelledby="ad-now">
                <h2 class="cp-card__title" id="ad-now">Right now</h2>
                <p class="ad__line">With the saved rules.</p>
                @if (dashboard(); as d) {
                  <dl class="ad__facts">
                    <div>
                      <dt>Public listings</dt>
                      <dd>{{ d.publicItems.toLocaleString('en-US') }}</dd>
                    </div>
                    <div [class.ad__fact--warn]="d.staleItems > 0">
                      <dt>Stale</dt>
                      <dd>{{ d.staleItems.toLocaleString('en-US') }}</dd>
                    </div>
                    <div [class.ad__fact--warn]="d.hiddenItems > 0">
                      <dt>Hidden</dt>
                      <dd>{{ d.hiddenItems.toLocaleString('en-US') }}</dd>
                    </div>
                    <div>
                      <dt>Collectors with paused listings</dt>
                      <dd>{{ d.ownersWithPausedListings.toLocaleString('en-US') }}</dd>
                    </div>
                  </dl>
                } @else if (dashboardError()) {
                  <p class="ad__line">
                    The counts could not load.
                    <button type="button" class="cp-link ad__retry" (click)="loadSide()">
                      Try again
                    </button>
                  </p>
                } @else {
                  <app-skeleton variant="list" lines="2" />
                }
                <a class="cp-link" routerLink="/admin/listings"
                  >Review listings <app-admin-icon name="arrowRight" [size]="16"
                /></a>
              </section>
              <section class="cp-card ad__card" aria-labelledby="ad-job">
                <h2 class="cp-card__title" id="ad-job">Listing freshness job</h2>
                <p class="ad__line">
                  Runs every hour and applies these rules. Strikes and pauses are counted nightly.
                </p>
                @if (freshness(); as job) {
                  <p class="ad__run">
                    Last run {{ job.lastStartedAt | date: 'MMM d, HH:mm' }}
                    <span
                      class="cp-chip"
                      [class.cp-chip--success]="job.lastStatus === 'SUCCEEDED'"
                      [class.cp-chip--danger]="job.lastStatus === 'FAILED'"
                      [class.cp-chip--info]="job.lastStatus === 'RUNNING'"
                      >{{
                        job.lastStatus === 'SUCCEEDED'
                          ? 'Succeeded'
                          : job.lastStatus === 'FAILED'
                            ? 'Failed'
                            : 'Running'
                      }}</span
                    >
                  </p>
                } @else if (healthLoaded()) {
                  <p class="ad__run">No run yet.</p>
                }
                <a class="cp-link" routerLink="/admin/system-health"
                  >System health <app-admin-icon name="arrowRight" [size]="16"
                /></a>
              </section>
            </aside>
          </div>
        }
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading the rules</span>
          <app-skeleton height="360px" />
        </div>
      }
    </div>
  `,
  styleUrls: ['../console/console-page.scss', '../console/console-controls.scss'],
  styles: `
    .ad {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 24px;
      align-items: start;
    }
    .ad__main,
    .ad__side {
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-width: 0;
    }
    .ad__card {
      padding: 20px 24px 22px;
    }
    .ad__meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 14px 0 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .ad__line {
      margin: 4px 0 12px;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .ad__facts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 0 0 12px;
    }
    .ad__facts div {
      padding: 10px 12px;
      border: 1px solid var(--color-border);
      border-radius: 12px;
      background: var(--color-background);
    }
    .ad__facts dt {
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }
    .ad__facts dd {
      margin: 4px 0 0;
      color: var(--color-ink);
      font-family: var(--font-display);
      font-size: 18px;
      font-weight: var(--font-weight-bold);
    }
    .ad__fact--warn dd {
      color: var(--app-warning-text);
    }
    .ad__run {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 0 0 12px;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
    .ad__retry {
      min-height: 24px;
      padding: 0;
      border: 0;
      background: none;
      cursor: pointer;
    }
    @media (max-width: 1279.98px) {
      .ad {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDelistRulesPageComponent {
  private readonly api = inject(AdminDelistingService);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);
  private readonly consoleApi = inject(AdminConsoleService);

  protected readonly policies = signal<DelistPolicyResponse[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly dashboard = signal<AdminDashboard | null>(null);
  protected readonly dashboardError = signal(false);
  protected readonly freshness = signal<JobStatus | null>(null);
  protected readonly healthLoaded = signal(false);

  constructor() {
    this.load();
    this.loadSide();
  }

  /** "Last changed Oct 2 by Rosa Lima" (spec 15.8: a name, never an id). */
  protected changed(policy: DelistPolicyResponse): string {
    return changedLine(policy);
  }

  protected loadSide(): void {
    this.dashboardError.set(false);
    this.consoleApi.getAdminDashboard('body', false, { context: silentErrors() }).subscribe({
      next: (dashboard) => this.dashboard.set(dashboard),
      error: () => this.dashboardError.set(true),
    });
    this.consoleApi.getSystemHealth('body', false, { context: silentErrors() }).subscribe({
      next: (health) => {
        this.freshness.set(health.jobs?.find((job) => job.name === 'freshness') ?? null);
        this.healthLoaded.set(true);
      },
      error: () => this.healthLoaded.set(true),
    });
  }

  protected load(): void {
    this.error.set(null);
    this.policies.set(null);
    this.api.listDelistPolicies('body', false, { context: silentErrors() }).subscribe({
      next: (policies) => this.policies.set(policies ?? []),
      error: (error: unknown) => this.error.set(toApiError(error)),
    });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected async save(
    policy: DelistPolicyResponse,
    request: UpdateDelistPolicyRequest,
  ): Promise<void> {
    const confirmed = await confirmAdminAction(this.dialog, {
      title: 'Save the auto-delist rules?',
      message:
        `Listings become aging after ${request.agingAfterDays} days, stale after ` +
        `${request.staleAfterDays} and hidden after ${request.hiddenAfterDays} (warning ` +
        `${request.warnBeforeHiddenDays} days before). ${request.maxStrikes} unanswered ` +
        `conversations (after ${request.unansweredAfterHours} h) pause a collector's listings.`,
      confirmLabel: 'Save rules',
    });
    if (!confirmed) {
      return;
    }
    this.busy.set(policy.id);
    const updated = await runConsoleAction(
      this.toasts,
      this.api.updateDelistPolicy(
        { id: policy.id, updateDelistPolicyRequest: request },
        'body',
        false,
        { context: silentErrors() },
      ),
      'Auto-delist rules saved.',
    );
    this.busy.set(null);
    if (updated) {
      this.policies.update((list) =>
        (list ?? []).map((item) => (item.id === updated.id ? updated : item)),
      );
    }
  }
}
