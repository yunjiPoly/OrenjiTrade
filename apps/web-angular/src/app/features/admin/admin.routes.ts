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
        // Moderators and admins (moderation area).
        path: 'reports',
        title: 'Reports · Admin',
        loadComponent: () =>
          import('./reports/admin-reports-page.component').then((m) => m.AdminReportsPageComponent),
      },
      {
        path: 'reports/:id',
        title: 'Report · Admin',
        loadComponent: () =>
          import('./reports/admin-report-detail-page.component').then(
            (m) => m.AdminReportDetailPageComponent,
          ),
      },
      {
        path: 'moderation',
        title: 'Moderation · Admin',
        loadComponent: () =>
          import('./moderation/admin-moderation-page.component').then(
            (m) => m.AdminModerationPageComponent,
          ),
      },
      {
        path: 'ratings',
        title: 'Ratings · Admin',
        loadComponent: () =>
          import('./ratings/admin-ratings-page.component').then((m) => m.AdminRatingsPageComponent),
      },
      {
        path: 'listings',
        title: 'Listings · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./listings/admin-listings-page.component').then(
            (m) => m.AdminListingsPageComponent,
          ),
      },
      {
        path: 'binders',
        title: 'Binders · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./binders/admin-binders-page.component').then((m) => m.AdminBindersPageComponent),
      },
      {
        path: 'notifications',
        title: 'Notifications · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./notifications/admin-notifications-page.component').then(
            (m) => m.AdminNotificationsPageComponent,
          ),
      },
      {
        path: 'analytics',
        title: 'Analytics · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./analytics/admin-analytics-page.component').then(
            (m) => m.AdminAnalyticsPageComponent,
          ),
      },
      {
        path: 'auto-delist-rules',
        title: 'Auto-delist rules · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./delist/admin-delist-rules-page.component').then(
            (m) => m.AdminDelistRulesPageComponent,
          ),
      },
      {
        path: 'system-health',
        title: 'System health · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./health/admin-system-health-page.component').then(
            (m) => m.AdminSystemHealthPageComponent,
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
