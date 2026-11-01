import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { ADMIN_AREA, adminGuard } from '../../core/auth/auth.guards';
import { FEATURE } from '../../core/feature-flags/feature-flags.service';
import { featureGuard } from '../../core/feature-flags/feature.guard';

/**
 * The PAYMENTS group's pages (Transactions, Disputes, Payments) open only while
 * `protectedPayments` is on (spec 15.1): typed into the address bar while it is off, they say so
 * and go to the Overview. The nav hides the group too.
 */
export const paymentsGuard = featureGuard(
  FEATURE.protectedPayments,
  'Protected payments',
  '/admin',
);

/** The paths of the PAYMENTS group, guarded by {@link paymentsGuard}. */
export const PAYMENT_PATHS = [
  'transactions',
  'disputes',
  'disputes/:id',
  'payments',
  'payments/webhooks',
  'payments/settings',
  'payments/:id',
] as const;

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
        // The Overview (spec 15.3, boards A1 and A24).
        path: '',
        pathMatch: 'full',
        title: 'Overview · Admin',
        loadComponent: () =>
          import('./overview/admin-overview.component').then((m) => m.AdminOverviewComponent),
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
        path: 'regions',
        title: 'Regions · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./regions/admin-regions-page.component').then((m) => m.AdminRegionsPageComponent),
      },
      {
        path: 'wishlist',
        title: 'Wishlist terms · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./wishlist/admin-wishlist-settings-page.component').then(
            (m) => m.AdminWishlistSettingsPageComponent,
          ),
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
        // The card editor moved into the Cards page's drawer (spec 15.6, board A11): an old
        // address opens the list with the card in the drawer.
        path: 'cards/:id',
        redirectTo: ({ params }) =>
          inject(Router).createUrlTree(['/admin/cards'], { queryParams: { open: params['id'] } }),
      },
      {
        // Card data and images (spec 15.6, board A12; stage WH2): today's sync panel as a page.
        path: 'card-data',
        title: 'Card data and images · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./card-data/admin-card-data-page.component').then(
            (m) => m.AdminCardDataPageComponent,
          ),
      },
      {
        // Import limits (spec 15.7, board A15; stage WH2, new page).
        path: 'import-limits',
        title: 'Import limits · Admin',
        canActivate: [adminGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./import-limits/admin-import-limits-page.component').then(
            (m) => m.AdminImportLimitsPageComponent,
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
        // Moderators and admins: one split view (spec 15.4, board A2); the URL still names the
        // open report (`/admin/reports/:id`).
        path: 'reports',
        title: 'Reports · Admin',
        loadComponent: () =>
          import('./reports/admin-reports-page.component').then((m) => m.AdminReportsPageComponent),
        children: [
          { path: '', pathMatch: 'full', children: [] },
          {
            path: ':id',
            title: 'Report · Admin',
            loadComponent: () =>
              import('./reports/report-panel.component').then((m) => m.ReportPanelComponent),
          },
        ],
      },
      {
        path: 'moderation',
        title: 'Flags and rules · Admin',
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
        path: 'transactions',
        title: 'Transactions · Admin',
        canActivate: [adminGuard, paymentsGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./payments/admin-transactions-page.component').then(
            (m) => m.AdminTransactionsPageComponent,
          ),
      },
      {
        path: 'disputes',
        title: 'Disputes · Admin',
        canActivate: [adminGuard, paymentsGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./disputes/admin-disputes-page.component').then(
            (m) => m.AdminDisputesPageComponent,
          ),
      },
      {
        path: 'disputes/:id',
        title: 'Dispute · Admin',
        canActivate: [adminGuard, paymentsGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./disputes/admin-dispute-detail-page.component').then(
            (m) => m.AdminDisputeDetailPageComponent,
          ),
      },
      {
        path: 'payments',
        title: 'Payments · Admin',
        canActivate: [adminGuard, paymentsGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./payments/admin-payments-page.component').then(
            (m) => m.AdminPaymentsPageComponent,
          ),
      },
      {
        path: 'payments/webhooks',
        title: 'Webhook events · Admin',
        canActivate: [adminGuard, paymentsGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./payments/admin-webhooks-page.component').then(
            (m) => m.AdminWebhooksPageComponent,
          ),
      },
      {
        path: 'payments/settings',
        title: 'Payment rules · Admin',
        canActivate: [adminGuard, paymentsGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./payments/admin-payment-settings-page.component').then(
            (m) => m.AdminPaymentSettingsPageComponent,
          ),
      },
      {
        path: 'payments/:id',
        title: 'Payment · Admin',
        canActivate: [adminGuard, paymentsGuard],
        data: { [ADMIN_AREA]: 'admin' },
        loadComponent: () =>
          import('./payments/admin-payment-detail-page.component').then(
            (m) => m.AdminPaymentDetailPageComponent,
          ),
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
        title: 'Auto-delist · Admin',
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
        title: 'Audit log · Admin',
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
