import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { accountGuard } from '../../core/auth/auth.guards';
import { AuthService } from '../../core/auth/auth.service';

/** `/settings`: Profile for a collector, Appearance for a guest. */
export function settingsHome(): string {
  return inject(AuthService).isAuthenticated() ? 'profile' : 'appearance';
}

/**
 * `/settings/*`: one child route per section inside the settings shell. Every section is the
 * account's (`accountGuard`) except Appearance and Legal, which a guest may open (spec 14).
 */
export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./settings-shell.component').then((m) => m.SettingsShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: settingsHome },
      {
        path: 'profile',
        title: 'Profile settings',
        canActivate: [accountGuard],
        loadComponent: () =>
          import('./profile/profile-settings.component').then((m) => m.ProfileSettingsComponent),
      },
      {
        path: 'privacy',
        title: 'Privacy settings',
        canActivate: [accountGuard],
        loadComponent: () =>
          import('./privacy/privacy-settings.component').then((m) => m.PrivacySettingsComponent),
      },
      {
        path: 'notifications',
        title: 'Notification settings',
        canActivate: [accountGuard],
        loadComponent: () =>
          import('./notifications/notification-settings.component').then(
            (m) => m.NotificationSettingsComponent,
          ),
      },
      {
        path: 'location',
        title: 'Location',
        canActivate: [accountGuard],
        loadComponent: () =>
          import('./location/location-settings.component').then((m) => m.LocationSettingsComponent),
      },
      {
        // Web stage WC (spec 13, decision 9): the web saves no address or e-Transfer email.
        path: 'shipping',
        title: 'Shipping details',
        canActivate: [accountGuard],
        loadComponent: () =>
          import('./shipping/shipping-settings.component').then((m) => m.ShippingSettingsComponent),
      },
      // Bookmarks and e-mails from before platform regions (ADR 0017).
      { path: 'trading-area', pathMatch: 'full', redirectTo: 'location' },
      // Offers and payouts left the web (decision 2, spec 4.11).
      { path: 'offers', pathMatch: 'full', redirectTo: 'profile' },
      { path: 'payouts', pathMatch: 'full', redirectTo: 'profile' },
      {
        path: 'blocked',
        title: 'Blocked users',
        canActivate: [accountGuard],
        loadComponent: () =>
          import('./blocked/blocked-users-settings.component').then(
            (m) => m.BlockedUsersSettingsComponent,
          ),
      },
      {
        path: 'reports',
        title: 'My reports',
        canActivate: [accountGuard],
        loadComponent: () =>
          import('./reports/my-reports-settings.component').then(
            (m) => m.MyReportsSettingsComponent,
          ),
      },
      {
        path: 'account',
        title: 'Account settings',
        canActivate: [accountGuard],
        loadComponent: () =>
          import('./account/account-settings.component').then((m) => m.AccountSettingsComponent),
      },
      {
        path: 'appearance',
        title: 'Appearance',
        loadComponent: () =>
          import('./appearance/appearance-settings.component').then(
            (m) => m.AppearanceSettingsComponent,
          ),
      },
      {
        // Web stage WE (spec 13): the legal documents and Trading safely.
        path: 'legal',
        title: 'Legal',
        loadComponent: () =>
          import('./legal/legal-settings.component').then((m) => m.LegalSettingsComponent),
      },
      { path: '**', redirectTo: settingsHome },
    ],
  },
];
