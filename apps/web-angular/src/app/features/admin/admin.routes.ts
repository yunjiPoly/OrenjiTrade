import { Routes } from '@angular/router';
import { ADMIN_AREA, adminGuard } from '../../core/auth/auth.guards';

/**
 * `/admin` console: shell with side navigation. The parent route is guarded by `adminGuard`
 * (staff only); admin-only children repeat it with `adminArea: 'admin'` so moderators are
 * redirected to the dashboard.
 */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Admin',
        loadComponent: () =>
          import('./admin-dashboard.component').then((m) => m.AdminDashboardComponent),
      },
      {
        path: 'users',
        title: 'Users · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./users/admin-users-page.component').then((m) => m.AdminUsersPageComponent),
      },
      {
        path: 'users/:id',
        title: 'User · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./users/admin-user-detail-page.component').then(
            (m) => m.AdminUserDetailPageComponent,
          ),
      },
      {
        path: 'games',
        title: 'Games · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./games/admin-games-page.component').then((m) => m.AdminGamesPageComponent),
      },
      {
        path: 'cards',
        title: 'Cards · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./cards/admin-cards-page.component').then((m) => m.AdminCardsPageComponent),
      },
      {
        path: 'cards/:id',
        title: 'Card · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./cards/admin-card-edit-page.component').then(
            (m) => m.AdminCardEditPageComponent,
          ),
      },
      {
        path: 'feature-flags',
        title: 'Feature flags · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./feature-flags/admin-feature-flags-page.component').then(
            (m) => m.AdminFeatureFlagsPageComponent,
          ),
      },
      {
        path: 'usage-limits',
        title: 'Usage limits · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./usage-limits/admin-usage-limits-page.component').then(
            (m) => m.AdminUsageLimitsPageComponent,
          ),
      },
      {
        // Moderators and admins (moderation area).
        path: 'community',
        title: 'Community · Admin',
        loadComponent: () =>
          import('./community/admin-community-page.component').then(
            (m) => m.AdminCommunityPageComponent,
          ),
      },
      {
        path: 'audit-logs',
        title: 'Audit logs · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./audit/admin-audit-logs-page.component').then(
            (m) => m.AdminAuditLogsPageComponent,
          ),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
