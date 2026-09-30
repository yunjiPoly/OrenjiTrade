import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AdminDelistingService,
  DelistPolicyResponse,
  UpdateDelistPolicyRequest,
} from '@orenji/api-client';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { confirmAdminAction, runAdminAction } from '../shared/admin-actions';
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
    MatIconModule,
    DelistPolicyEditorComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Auto-delist rules"
        subtitle="Keep the map trustworthy: listings nobody confirms fade out, and collectors who stop answering pause until they are back. Nothing is ever deleted."
      />
      @if (error(); as error) {
        <app-error-state
          title="The rules could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
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
          @for (policy of list; track policy.id) {
            <section class="admin-card policy" [attr.aria-label]="'Policy ' + policy.name">
              <app-delist-policy-editor
                [policy]="policy"
                [busy]="busy() === policy.id"
                (save)="save(policy, $event)"
              />
              <p class="admin-muted policy__meta">
                <mat-icon aria-hidden="true">history</mat-icon>
                Last changed
                <span [title]="policy.updatedAt | date: 'medium'">{{
                  policy.updatedAt | relativeTime
                }}</span>
                · changes apply from the next hourly freshness run.
              </p>
            </section>
          }
        }
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading the rules</span>
          <app-skeleton height="360px" />
        </div>
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .policy + .policy {
      margin-top: var(--spacing-4);
    }
    .policy__meta {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: var(--spacing-3);
    }
    .policy__meta mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDelistRulesPageComponent {
  private readonly api = inject(AdminDelistingService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly policies = signal<DelistPolicyResponse[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<string | null>(null);

  constructor() {
    this.load();
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
    const updated = await runAdminAction(
      this.snackBar,
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
