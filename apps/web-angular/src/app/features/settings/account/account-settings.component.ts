import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { DeletionRequestResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AccountExportService } from '../../../core/account/account-export.service';
import { authErrorMessage } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_LABELS } from '../../../core/auth/roles';
import { SessionService } from '../../../core/auth/session.service';
import { isApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';
import { DeleteAccountDialogComponent } from './delete-account-dialog.component';

/** Settings → Account: email and verification, plan, data export, account deletion. */
@Component({
  selector: 'app-account-settings',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SectionCardComponent,
  ],
  templateUrl: './account-settings.component.html',
  styleUrls: ['../settings-section.scss', './account-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSettingsComponent {
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly exporter = inject(AccountExportService);
  protected readonly auth = inject(AuthService);
  protected readonly session = inject(SessionService);

  protected readonly exporting = signal(false);
  protected readonly sendingVerification = signal(false);
  protected readonly roleLabels = computed(() =>
    this.session
      .roles()
      .filter((role) => role !== 'USER')
      .map((role) => ROLE_LABELS[role]),
  );
  protected readonly signInMethod = computed(() =>
    this.auth.providerIds().includes('google.com')
      ? this.auth.hasPasswordProvider()
        ? 'Email and password, Google'
        : 'Google'
      : 'Email and password',
  );

  protected async resendVerification(): Promise<void> {
    this.sendingVerification.set(true);
    try {
      await this.auth.sendEmailVerification();
      this.snackBar.open('Verification email sent. Check your inbox.', 'OK', { duration: 4000 });
    } catch (error) {
      this.snackBar.open(authErrorMessage(error), 'OK', { duration: 5000 });
    } finally {
      this.sendingVerification.set(false);
    }
  }

  protected async exportData(): Promise<void> {
    this.exporting.set(true);
    try {
      const fileName = await this.exporter.download(this.session.handle());
      this.snackBar.open(`Downloaded ${fileName}.`, 'OK', { duration: 4000 });
    } catch (error) {
      this.snackBar.open(
        isApiError(error) ? friendlyMessage(error) : 'The export failed. Please try again.',
        'OK',
        { duration: 5000 },
      );
    } finally {
      this.exporting.set(false);
    }
  }

  protected async deleteAccount(): Promise<void> {
    const request = await firstValueFrom(
      this.dialog
        .open<DeleteAccountDialogComponent, void, DeletionRequestResponse>(
          DeleteAccountDialogComponent,
          { panelClass: 'app-dialog--md', autoFocus: 'first-tabbable' },
        )
        .afterClosed(),
    );
    if (!request) {
      return;
    }
    await this.session.load();
    this.snackBar.open('Your account is scheduled for deletion.', 'OK', { duration: 5000 });
    await this.router.navigateByUrl('/auth/suspended');
  }
}
