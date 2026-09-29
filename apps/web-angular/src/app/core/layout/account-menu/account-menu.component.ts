import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { AuthService } from '../../auth/auth.service';
import { SessionService } from '../../auth/session.service';
import { FEATURE, FeatureFlagsService } from '../../feature-flags/feature-flags.service';

/**
 * Account entry of the top bar. Signed out: sign in / create account. Signed in: avatar trigger
 * with name and handle, profile, settings, admin (staff only) and sign out.
 */
@Component({
  selector: 'app-account-menu',
  imports: [
    RouterLink,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    AvatarComponent,
  ],
  template: `
    @if (auth.isAuthenticated()) {
      <button
        type="button"
        class="account__trigger"
        [matMenuTriggerFor]="signedIn"
        [attr.aria-label]="'Account menu for ' + session.displayName()"
        matTooltip="Account"
      >
        <app-avatar
          size="sm"
          [src]="session.me()?.avatarUrl"
          [name]="session.displayName()"
          [decorative]="true"
        />
      </button>
      <mat-menu #signedIn="matMenu" xPosition="before" class="account-menu">
        <div class="account__header" role="presentation">
          <app-avatar
            [src]="session.me()?.avatarUrl"
            [name]="session.displayName()"
            [decorative]="true"
          />
          <div class="account__who">
            <span class="account__name" data-testid="account-menu-name">{{
              session.displayName()
            }}</span>
            @if (session.handle(); as handle) {
              <span class="account__handle" data-testid="account-menu-handle"
                >&#64;{{ handle }}</span
              >
            }
          </div>
        </div>
        <mat-divider />
        @if (session.handle(); as handle) {
          <a mat-menu-item [routerLink]="['/collectors', handle]">
            <mat-icon>person</mat-icon>
            <span>Profile</span>
          </a>
        }
        <a mat-menu-item routerLink="/settings">
          <mat-icon>settings</mat-icon>
          <span>Settings</span>
        </a>
        @if (premiumPlans()) {
          <a mat-menu-item routerLink="/premium">
            <mat-icon>workspace_premium</mat-icon>
            <span>Premium</span>
          </a>
        }
        @if (session.canAccessAdmin()) {
          <a mat-menu-item routerLink="/admin">
            <mat-icon>admin_panel_settings</mat-icon>
            <span>Admin</span>
          </a>
        }
        <mat-divider />
        <button mat-menu-item type="button" (click)="signOut()">
          <mat-icon>logout</mat-icon>
          <span>Sign out</span>
        </button>
      </mat-menu>
    } @else {
      <button
        matIconButton
        type="button"
        aria-label="Account"
        matTooltip="Account"
        [matMenuTriggerFor]="signedOut"
        [disabled]="loading()"
      >
        <mat-icon>account_circle</mat-icon>
      </button>
      <mat-menu #signedOut="matMenu" xPosition="before">
        <a mat-menu-item routerLink="/auth/sign-in">
          <mat-icon>login</mat-icon>
          <span>Sign in</span>
        </a>
        <a mat-menu-item routerLink="/auth/sign-up">
          <mat-icon>person_add</mat-icon>
          <span>Create account</span>
        </a>
      </mat-menu>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .account__trigger {
      display: inline-flex;
      padding: 4px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      cursor: pointer;
    }
    .account__trigger:hover {
      background: var(--color-surface-variant);
    }
    .account__header {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-3) var(--spacing-4);
      min-width: 220px;
    }
    .account__who {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .account__name {
      font-weight: var(--font-weight-semibold);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .account__handle {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountMenuComponent {
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);
  protected readonly session = inject(SessionService);
  protected readonly loading = computed(() => this.auth.authState() === 'loading');
  protected readonly premiumPlans = inject(FeatureFlagsService).enabled(FEATURE.premiumPlans);

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.snackBar.open('You are signed out. See you soon!', 'OK', { duration: 3000 });
    await this.router.navigateByUrl('/map');
  }
}
