import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { AuthService } from '../../auth/auth.service';
import { SessionService } from '../../auth/session.service';
import { KeyboardShortcuts } from '../../keyboard/keyboard-shortcuts.service';
import { ThemePreference, ThemeService } from '../../theme/theme.service';
import { ShellIconComponent } from '../shell-icon/shell-icon.component';

/** The three theme choices of "Appearance ›" (board W3's wording). */
export const THEME_CHOICES: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Same as the system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * The account menu (240, anchored to the avatar; spec 4.7, board W3): the avatar, name and
 * handle; View my profile, Settings, Appearance › (Same as the system, Light, Dark), Keyboard
 * shortcuts, Trading safely; for staff only, after a divider, Admin console; then Sign out in
 * danger. No Offers, Trades or Payouts. Signed out, the top bar shows "Sign in" instead.
 */
@Component({
  selector: 'app-account-menu',
  imports: [RouterLink, MatMenuModule, AvatarComponent, ShellIconComponent],
  template: `
    <button
      type="button"
      class="account__trigger"
      [matMenuTriggerFor]="menu"
      [attr.aria-label]="'Account menu, ' + session.displayName()"
      data-testid="account-menu-trigger"
    >
      <app-avatar
        size="sm"
        [src]="session.me()?.avatarUrl"
        [name]="session.displayName()"
        [decorative]="true"
      />
    </button>
    <mat-menu #menu="matMenu" xPosition="before" class="account-menu">
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
            <span class="account__handle" data-testid="account-menu-handle">&#64;{{ handle }}</span>
          }
        </div>
      </div>
      <a mat-menu-item routerLink="/profile">
        <app-shell-icon class="account__icon" name="profile" [size]="20" />
        <span>View my profile</span>
      </a>
      <a mat-menu-item routerLink="/settings">
        <app-shell-icon class="account__icon" name="settings" [size]="20" />
        <span>Settings</span>
      </a>
      <button mat-menu-item type="button" [matMenuTriggerFor]="appearance">
        <app-shell-icon class="account__icon" name="contrast" [size]="20" />
        <span>Appearance</span>
      </button>
      <button mat-menu-item type="button" (click)="shortcuts.openHelp()">
        <app-shell-icon class="account__icon" name="keyboard" [size]="20" />
        <span>Keyboard shortcuts</span>
        <kbd class="account__key" aria-hidden="true">?</kbd>
      </button>
      <a mat-menu-item routerLink="/legal/trading-safely">
        <app-shell-icon class="account__icon" name="shieldCheck" [size]="20" />
        <span>Trading safely</span>
      </a>
      @if (session.canAccessAdmin()) {
        <div class="account__divider" role="separator"></div>
        <a mat-menu-item routerLink="/admin">
          <app-shell-icon class="account__icon" name="shield" [size]="20" />
          <span>Admin console</span>
        </a>
      }
      <div class="account__divider" role="separator"></div>
      <button mat-menu-item type="button" class="account__signout" (click)="signOut()">
        <app-shell-icon class="account__icon" name="logOut" [size]="20" />
        <span>Sign out</span>
      </button>
    </mat-menu>
    <mat-menu #appearance="matMenu" class="account-menu account-menu--sub">
      @for (choice of themes; track choice.value) {
        <button
          mat-menu-item
          type="button"
          role="menuitemradio"
          [attr.aria-checked]="theme.preference() === choice.value"
          (click)="theme.setPreference(choice.value)"
        >
          <span class="account__radio" [class.account__radio--on]="theme.preference() === choice.value" aria-hidden="true"></span>
          <span>{{ choice.label }}</span>
        </button>
      }
    </mat-menu>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .account__trigger {
      display: inline-flex;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      cursor: pointer;
    }
    .account__trigger:hover {
      box-shadow: 0 0 0 3px var(--color-surface-variant);
    }
    .account__header {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: 10px 12px 12px;
      margin-bottom: 4px;
      border-bottom: 1px solid var(--color-border);
    }
    .account__who {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .account__name {
      overflow: hidden;
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .account__handle {
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
    }
    .account__icon {
      margin-right: 12px;
      color: var(--color-text-secondary);
    }
    .account__key {
      margin-left: auto;
      padding: 0 6px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-sm);
      color: var(--color-text-muted);
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
    }
    .account__divider {
      height: 1px;
      margin: 4px 0;
      background: var(--color-border);
    }
    .account__signout,
    .account__signout .account__icon {
      color: var(--color-danger);
    }
    .account__radio {
      width: 18px;
      height: 18px;
      margin-right: 12px;
      border: 2px solid var(--color-border-strong);
      border-radius: 50%;
    }
    .account__radio--on {
      border-color: var(--color-primary);
      background: radial-gradient(circle, var(--color-primary) 0 4px, transparent 4.5px);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountMenuComponent {
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  protected readonly session = inject(SessionService);
  protected readonly theme = inject(ThemeService);
  protected readonly shortcuts = inject(KeyboardShortcuts);
  protected readonly themes = THEME_CHOICES;

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.snackBar.open('You are signed out. See you soon!', undefined, { duration: 6000 });
    await this.router.navigateByUrl('/');
  }
}
