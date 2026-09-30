import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { SessionService } from '../../auth/session.service';
import { friendlyMessage } from '../../http/api-error-messages';

/**
 * Thin banner under the top bar while the signed-in collector's account could not be loaded
 * (API unreachable, server error, rejected token). Offers a retry, and a sign-out when the API no
 * longer accepts the session.
 */
@Component({
  selector: 'app-session-banner',
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (session.status() === 'error' && session.error(); as error) {
      <div class="banner" role="alert">
        <mat-icon aria-hidden="true">{{ error.isNetworkError ? 'cloud_off' : 'error' }}</mat-icon>
        <p class="banner__text">
          <strong>We could not load your account.</strong>
          {{ message() }}
        </p>
        <div class="banner__actions">
          <button
            matButton="tonal"
            type="button"
            [disabled]="session.refreshing()"
            (click)="retry()"
          >
            <mat-icon aria-hidden="true">refresh</mat-icon>
            Retry
          </button>
          @if (error.status === 401) {
            <button matButton type="button" (click)="signOut()">Sign out</button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2) var(--spacing-3);
      padding: var(--spacing-2) var(--spacing-4);
      background: color-mix(in srgb, var(--color-warning) 16%, var(--color-surface));
      border-bottom: 1px solid color-mix(in srgb, var(--color-warning) 40%, transparent);
    }
    .banner mat-icon {
      color: var(--color-warning);
    }
    .banner__text {
      flex: 1 1 280px;
      margin: 0;
      font-size: var(--font-size-sm);
    }
    .banner__actions {
      display: flex;
      gap: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionBannerComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);
  protected readonly message = computed(() => {
    const error = this.session.error();
    return error ? friendlyMessage(error) : '';
  });

  protected retry(): void {
    void this.session.load();
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/auth/sign-in');
  }
}
