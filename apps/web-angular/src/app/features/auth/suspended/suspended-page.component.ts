import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AccountService, DeletionRequestResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AccountExportService } from '../../../core/account/account-export.service';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { SKIP_SESSION_REDIRECT, silentErrors } from '../../../core/http/http-context';
import {
  ShellIconComponent,
  ShellIconName,
} from '../../../core/layout/shell-icon/shell-icon.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';

/**
 * The line under a suspension's title: the words the API sent, unless they are its general "This
 * account is suspended", which only repeats the title (the phone's R12 `suspensionReason`; the API
 * sends no moderator's reason, owner decision of 2026-10-28).
 */
export function suspensionReason(message: string | null | undefined): string | null {
  const text = message?.trim() ?? '';
  return !text || /^this account is suspended\.?$/i.test(text) ? null : text;
}

/**
 * `/auth/suspended`, an account state (spec 14: a centred 480 card): a suspension ("Your account
 * is suspended", the end date when it has one, the appeal line, Community guidelines, Sign out;
 * the login stays on during a suspension, owner decision of 2026-10-28), or a pending deletion
 * ("Your account is scheduled for deletion" with [Cancel deletion] and "Download my data").
 */
@Component({
  selector: 'app-suspended-page',
  imports: [DatePipe, RouterLink, ShellIconComponent, AuthLayoutComponent, SkeletonComponent],
  templateUrl: './suspended-page.component.html',
  styleUrl: '../auth-form.scss',
  styles: `
    .strong {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .link--inline {
      display: inline;
      min-height: 0;
      padding: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuspendedPageComponent {
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly accountApi = inject(AccountService);
  private readonly exporter = inject(AccountExportService);
  private readonly auth = inject(AuthService);
  protected readonly session = inject(SessionService);

  protected readonly loading = signal(true);
  protected readonly pending = signal<DeletionRequestResponse | null>(null);
  protected readonly working = signal<'cancel' | 'export' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly reason = computed(() => suspensionReason(this.session.suspension()?.message));
  protected readonly icon = computed<ShellIconName>(() => {
    switch (this.session.status()) {
      case 'deletion-pending':
        return 'clock';
      case 'suspended':
        return 'ban';
      default:
        return 'profile';
    }
  });
  protected readonly tone = computed(() =>
    this.session.status() === 'suspended'
      ? 'danger'
      : this.session.status() === 'deletion-pending'
        ? 'warning'
        : 'accent',
  );
  protected readonly heading = computed(() => {
    switch (this.session.status()) {
      case 'deletion-pending':
        return 'Your account is scheduled for deletion';
      case 'suspended':
        return 'Your account is suspended';
      case 'anonymous':
        return 'You are signed out';
      default:
        return 'Your account is active';
    }
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    const status = await this.session.ensureLoaded();
    if (status === 'deletion-pending') {
      try {
        const requests = await firstValueFrom(
          this.accountApi.listAccountDeletionRequests('body', false, {
            context: silentErrors().set(SKIP_SESSION_REDIRECT, true),
          }),
        );
        this.pending.set(requests.find((request) => request.status === 'PENDING') ?? null);
      } catch (error) {
        this.error.set(friendlyMessage(toApiError(error)));
      }
    }
    this.loading.set(false);
  }

  protected async cancelDeletion(): Promise<void> {
    const request = this.pending();
    if (!request) {
      return;
    }
    this.working.set('cancel');
    this.error.set(null);
    try {
      await firstValueFrom(
        this.accountApi.cancelAccountDeletion({ id: request.id }, 'body', false, {
          context: silentErrors().set(SKIP_SESSION_REDIRECT, true),
        }),
      );
      await this.session.load();
      this.toasts.show({ title: 'Deletion cancelled. Welcome back!' });
      await this.router.navigateByUrl('/settings/account');
    } catch (error) {
      const apiError = toApiError(error);
      this.error.set(
        apiError.status === 401
          ? 'Your session ended. Sign in again, then cancel the deletion.'
          : friendlyMessage(apiError),
      );
    } finally {
      this.working.set(null);
    }
  }

  protected async exportData(): Promise<void> {
    this.working.set('export');
    this.error.set(null);
    try {
      await this.exporter.download(this.session.handle());
      this.toasts.show({ title: 'Your data export was downloaded.' });
    } catch (error) {
      this.error.set(friendlyMessage(toApiError(error)));
    } finally {
      this.working.set(null);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/auth/sign-in');
  }
}
