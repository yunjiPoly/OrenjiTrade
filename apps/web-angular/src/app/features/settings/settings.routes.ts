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
        path: 'trading-area',
        title: 'Trading area',
        loadComponent: () =>
          import('./trading-area/trading-area-settings.component').then(
            (m) => m.TradingAreaSettingsComponent,
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
