import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { AccountService, DeletionRequestResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AccountExportService } from '../../../core/account/account-export.service';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { SKIP_SESSION_REDIRECT, silentErrors } from '../../../core/http/http-context';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';

/**
 * `/auth/suspended`: explains why the account cannot be used. Two variants:
 * a suspension (optionally temporary), or a pending deletion during its grace period with
 * "cancel deletion" and "download my data".
 */
@Component({
  selector: 'app-suspended-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    AuthLayoutComponent,
    SkeletonComponent,
  ],
  templateUrl: './suspended-page.component.html',
  styleUrl: '../auth-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuspendedPageComponent {
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly accountApi = inject(AccountService);
  private readonly exporter = inject(AccountExportService);
  private readonly auth = inject(AuthService);
  protected readonly session = inject(SessionService);

  protected readonly loading = signal(true);
  protected readonly pending = signal<DeletionRequestResponse | null>(null);
  protected readonly working = signal<'cancel' | 'export' | null>(null);
  protected readonly error = signal<string | null>(null);
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
      this.snackBar.open('Deletion cancelled. Welcome back!', 'OK', { duration: 5000 });
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
      this.snackBar.open('Your data export was downloaded.', 'OK', { duration: 4000 });
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
