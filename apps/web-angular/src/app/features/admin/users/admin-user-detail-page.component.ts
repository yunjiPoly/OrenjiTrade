import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import {
  AdminUserDetail,
  AdminUsersService,
  AuditLogEntry,
  SuspendUserRequest,
  UpdateRolesRequestRolesEnum,
} from '@orenji/api-client';
import { Observable, firstValueFrom } from 'rxjs';
import { Role, hasAdminRole, rolePayload, roleList } from '../../../core/auth/roles';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { CONSENT_LABELS, auditActionLabel } from '../shared/admin-labels';
import { StatusChipComponent } from '../shared/status-chip.component';
import { FEATURE, FeatureFlagsService } from '../../../core/feature-flags/feature-flags.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { detailSummary } from '../audit/audit-entries';
import { AdminIconComponent } from '../console/admin-icon.component';
import { RECORDED } from '../console/console-actions';
import { RolesEditorComponent } from './roles-editor.component';
import { SuspendDialogComponent, SuspendDialogData } from './suspend-dialog.component';
import { UserModerationPanelComponent } from './user-moderation-panel.component';

/**
 * `/admin/users/:id`: account detail with suspend/unsuspend, the roles editor, listing status
 * with pause/resume and the moderation history, consents, deletion state and the latest audit entries. Every write is audited by the API.
 */
@Component({
  selector: 'app-admin-user-detail-page',
  imports: [
    DatePipe,
    RouterLink,
    AdminIconComponent,
    RelativeTimePipe,
    AvatarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
    StatusChipComponent,
    RolesEditorComponent,
    UserModerationPanelComponent,
  ],
  templateUrl: './admin-user-detail-page.component.html',
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    './admin-user-detail-page.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUserDetailPageComponent {
  private readonly usersApi = inject(AdminUsersService);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);
  private readonly flags = inject(FeatureFlagsService);
  protected readonly session = inject(SessionService);
  protected readonly listingsPanel = viewChild<UserModerationPanelComponent>('listings');
  protected readonly moderationPanel = viewChild<UserModerationPanelComponent>('moderation');
  private readonly paymentsOn = this.flags.enabled(FEATURE.protectedPayments);

  /** Bound from the `:id` route parameter. */
  readonly id = input.required<string>();

  protected readonly detail = signal<AdminUserDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<'suspend' | 'unsuspend' | 'roles' | null>(null);
  protected readonly consentLabels = CONSENT_LABELS;
  protected readonly auditActionLabel = auditActionLabel;

  protected readonly account = computed(() => this.detail()?.account ?? null);
  /** The Payment Protection and Refund lines only while `protectedPayments` is on (spec 15.5). */
  protected readonly consents = computed(() =>
    (this.detail()?.consents ?? []).filter(
      (consent) =>
        this.paymentsOn() ||
        (consent.documentType !== 'PAYMENT_PROTECTION' &&
          consent.documentType !== 'REFUND_DISPUTE'),
    ),
  );
  protected readonly roles = computed<Role[]>(() => roleList(this.account()?.roles));
  protected readonly isSelf = computed(() => this.account()?.id === this.session.me()?.id);
  /** Why suspension is not possible for this actor/target, or null. */
  protected readonly suspendBlockedReason = computed(() => {
    const account = this.account();
    if (!account) {
      return null;
    }
    if (this.isSelf()) {
      return 'You cannot suspend your own account.';
    }
    if (hasAdminRole(this.roles()) && !this.session.isSuperAdmin()) {
      return 'Only a super admin can suspend an administrator.';
    }
    if (account.status === 'DELETED') {
      return 'The account is deleted.';
    }
    return null;
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.load());
    });
  }

  /** A recent activity row in words ("Accepted the Community Guidelines v3", board A8). */
  protected activityLine(entry: AuditLogEntry): string {
    const details = (entry.details ?? {}) as Record<string, unknown>;
    if (entry.action === 'consent.accept') {
      const type = String(details['documentType'] ?? '');
      if (type === 'AGE_CONFIRMATION') {
        return 'Confirmed being 18 or older';
      }
      const name = CONSENT_LABELS[type] ?? type;
      return `Accepted the ${name}${details['version'] ? ` v${String(details['version'])}` : ''}`;
    }
    const summary = detailSummary(entry);
    return summary
      ? `${auditActionLabel(entry.action)} · ${summary}`
      : auditActionLabel(entry.action);
  }

  protected actorWord(type: string): string {
    return type === 'SYSTEM' ? 'System' : type === 'USER' ? 'The collector' : 'Staff';
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.detail.set(
        await this.call(
          this.usersApi.getUser({ id: this.id() }, 'body', false, { context: silentErrors() }),
        ),
      );
    } catch (error) {
      this.error.set(error as ApiError);
    } finally {
      this.loading.set(false);
    }
  }

  protected async suspend(): Promise<void> {
    const account = this.account();
    if (!account) {
      return;
    }
    const request = await firstValueFrom(
      this.dialog
        .open<SuspendDialogComponent, SuspendDialogData, SuspendUserRequest>(
          SuspendDialogComponent,
          {
            data: { handle: account.handle },
            panelClass: 'app-dialog--md',
          },
        )
        .afterClosed(),
    );
    if (!request) {
      return;
    }
    await this.act('suspend', `@${account.handle} is suspended.`, () =>
      this.usersApi.suspendUser({ id: account.id, suspendUserRequest: request }, 'body', false, {
        context: silentErrors(),
      }),
    );
  }

  protected async unsuspend(): Promise<void> {
    const account = this.account();
    if (!account) {
      return;
    }
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: `Lift the suspension of @${account.handle}?`,
            message: 'The collector can sign in and use OrenjiTrade again right away.',
            confirmLabel: 'Lift suspension',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    await this.act('unsuspend', `@${account.handle} can use OrenjiTrade again.`, () =>
      this.usersApi.unsuspendUser({ id: account.id }, 'body', false, { context: silentErrors() }),
    );
  }

  protected async saveRoles(roles: Role[]): Promise<void> {
    const account = this.account();
    if (!account) {
      return;
    }
    await this.act('roles', 'Roles updated.', () =>
      this.usersApi.updateUserRoles(
        {
          id: account.id,
          updateRolesRequest: { roles: rolePayload<UpdateRolesRequestRolesEnum>(roles) },
        },
        'body',
        false,
        { context: silentErrors() },
      ),
    );
  }

  private async act(
    kind: 'suspend' | 'unsuspend' | 'roles',
    success: string,
    request: () => Observable<unknown>,
  ): Promise<void> {
    this.busy.set(kind);
    try {
      await this.call(request());
      this.toasts.show({ title: success, sub: RECORDED });
      await this.load();
    } catch (error) {
      const apiError = error as ApiError;
      this.toasts.show({
        title: friendlyMessage(apiError),
        sub: apiError.requestId ? `Request ${apiError.requestId}` : null,
        tone: 'error',
      });
    } finally {
      this.busy.set(null);
    }
  }

  private async call<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toApiError(error);
    }
  }
}
