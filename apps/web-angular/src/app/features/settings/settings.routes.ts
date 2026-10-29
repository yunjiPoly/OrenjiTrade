import { Routes } from '@angular/router';

/** `/settings/*`: one child route per section inside the settings shell. */
export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./settings-shell.component').then((m) => m.SettingsShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      {
        path: 'profile',
        title: 'Profile settings',
        loadComponent: () =>
          import('./profile/profile-settings.component').then((m) => m.ProfileSettingsComponent),
      },
      {
        path: 'privacy',
        title: 'Privacy settings',
        loadComponent: () =>
          import('./privacy/privacy-settings.component').then((m) => m.PrivacySettingsComponent),
      },
      {
        path: 'notifications',
        title: 'Notification settings',
        loadComponent: () =>
          import('./notifications/notification-settings.component').then(
            (m) => m.NotificationSettingsComponent,
          ),
      },
      {
        path: 'location',
        title: 'Location',
        loadComponent: () =>
          import('./location/location-settings.component').then((m) => m.LocationSettingsComponent),
      },
      // Bookmarks and e-mails from before platform regions (ADR 0017).
      { path: 'trading-area', pathMatch: 'full', redirectTo: 'location' },
      // Offers and payouts left the web (decision 2, spec 4.11).
      { path: 'offers', pathMatch: 'full', redirectTo: 'profile' },
      { path: 'payouts', pathMatch: 'full', redirectTo: 'profile' },
      {
        path: 'blocked',
        title: 'Blocked users',
        loadComponent: () =>
          import('./blocked/blocked-users-settings.component').then(
            (m) => m.BlockedUsersSettingsComponent,
          ),
      },
      {
        path: 'reports',
        title: 'My reports',
        loadComponent: () =>
          import('./reports/my-reports-settings.component').then(
            (m) => m.MyReportsSettingsComponent,
          ),
      },
      {
        path: 'account',
        title: 'Account settings',
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
      { path: '**', redirectTo: 'profile' },
    ],
  },
];
