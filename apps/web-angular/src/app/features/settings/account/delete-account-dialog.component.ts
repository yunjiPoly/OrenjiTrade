import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AccountService, DeletionRequestResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AccountExportService } from '../../../core/account/account-export.service';
import { authErrorCode, authErrorMessage, isPopupDismissed } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { isApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { SKIP_SESSION_REDIRECT, silentErrors } from '../../../core/http/http-context';

/** Human labels of `DeletionParticipant` blockers (unknown codes are shown humanised). */
export const BLOCKER_LABELS: Record<string, string> = {
  OPEN_DISPUTE: 'You have an open dispute.',
  OPEN_TRADE: 'You have a trade in progress.',
  PENDING_PAYOUT: 'A payout is still pending.',
  OPEN_OFFER: 'You have open offers.',
};

export function blockerLabel(code: string): string {
  return BLOCKER_LABELS[code] ?? code.replace(/_/g, ' ').toLowerCase();
}

type Step = 'confirm' | 'working' | 'blocked';

const WRONG_PASSWORD = new Set([
  'auth/wrong-password',
  'auth/invalid-credential',
  'auth/invalid-login-credentials',
]);

/**
 * Account deletion: explains the 7-day grace period, optionally exports first, re-authenticates
 * (password or Google; the API needs a sign-in younger than 5 minutes) and files the request.
 * Closes with the created {@link DeletionRequestResponse}.
 */
@Component({
  selector: 'app-delete-account-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './delete-account-dialog.component.html',
  styleUrl: './delete-account-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteAccountDialogComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly dialogRef =
    inject<MatDialogRef<DeleteAccountDialogComponent, DeletionRequestResponse>>(MatDialogRef);
  private readonly accountApi = inject(AccountService);
  private readonly exporter = inject(AccountExportService);
  private readonly session = inject(SessionService);
  protected readonly auth = inject(AuthService);

  protected readonly form = this.fb.group({
    reason: ['', [Validators.maxLength(500)]],
    exportFirst: [true],
    password: [''],
    acknowledge: [false, [Validators.requiredTrue]],
  });
  protected readonly step = signal<Step>('confirm');
  protected readonly status = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly blockers = signal<string[]>([]);
  protected readonly blockerLabel = blockerLabel;

  constructor() {
    if (this.auth.hasPasswordProvider()) {
      this.form.controls.password.addValidators(Validators.required);
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { reason, exportFirst, password } = this.form.getRawValue();
    this.error.set(null);
    this.step.set('working');
    this.dialogRef.disableClose = true;
    try {
      this.status.set('Confirming it is you…');
      await this.auth.reauthenticate(
        this.auth.hasPasswordProvider() ? { kind: 'password', password } : { kind: 'google' },
      );
      if (exportFirst) {
        this.status.set('Preparing your data export…');
        await this.exporter.download(this.session.handle());
      }
      this.status.set('Scheduling the deletion…');
      const request = await firstValueFrom(
        this.accountApi.requestAccountDeletion(
          { createDeletionRequest: { reason: reason.trim() || null, exportFirst } },
          'body',
          false,
          { context: silentErrors().set(SKIP_SESSION_REDIRECT, true) },
        ),
      ).catch((error: unknown) => {
        throw toApiError(error);
      });
      this.dialogRef.close(request);
    } catch (error) {
      this.dialogRef.disableClose = false;
      if (isApiError(error) && error.errorCode === 'DELETION_BLOCKED') {
        this.blockers.set(error.problem?.blockers ?? []);
        this.step.set('blocked');
        return;
      }
      this.step.set('confirm');
      if (isApiError(error)) {
        this.error.set(friendlyMessage(error));
      } else if (WRONG_PASSWORD.has(authErrorCode(error) ?? '')) {
        this.error.set('That password is not correct.');
        this.form.controls.password.reset('');
      } else if (!isPopupDismissed(error)) {
        this.error.set(authErrorMessage(error));
      }
    }
  }
}
