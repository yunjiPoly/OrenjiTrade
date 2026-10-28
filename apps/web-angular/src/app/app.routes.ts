import { Routes } from '@angular/router';
import {
  accountGuard,
  accountStateGuard,
  adminGuard,
  authGuard,
  onboardingGuard,
} from './core/auth/auth.guards';
import { ShellRouteData } from './core/layout/shell-layout.service';
import {
  communityRedirect,
  mapRedirect,
  offersGoneRedirect,
  wishlistRedirect,
} from './core/routing/legacy-redirects';

/** `data.shell` of the web redesign's areas (spec 4.2 pill scope, 4.6 rail, 4.10 footer). */
const HOME: ShellRouteData = { area: 'home', pills: 'both', layout: 'workspace' };
const SEARCH: ShellRouteData = {
  area: 'search',
  pills: 'both',
  layout: 'workspace',
  pageSearch: true,
  hideGlobalSearch: true,
};
const DISCOVERY_PAGE: ShellRouteData = { area: 'search', pills: 'region', layout: 'reading' };
const INVENTORY: ShellRouteData = { area: 'inventory', pills: 'none', layout: 'workspace', pageSearch: true };
const MESSAGES: ShellRouteData = { area: 'messages', pills: 'none', layout: 'workspace' };
const PROFILE: ShellRouteData = { area: 'profile', pills: 'none', layout: 'reading' };

/**
 * Top-level routes (web redesign spec 4.11). Every page is lazy (`loadComponent` /
 * `loadChildren`) so the initial bundle only carries the shell. Titles feed `OrenjiTitleStrategy`;
 * `data.shell` tells the shell the rail's area, the pills in scope and the page layout.
 *
 * Guards: public product pages use `onboardingGuard` (anonymous visitors pass; signed-in
 * collectors must have accepted the terms and finished onboarding), account pages use
 * `accountGuard`, the admin console `adminGuard`.
 *
 * Old links redirect (spec 4.11): `/map` to Search › Binders, `/cards?q=` to Search › Cards,
 * `/wishlist` to Search › Wishlist, `/community` to Messages › Community, `/offers` and
 * `/trades` to Messages with a toast, `/checkout` and `/disputes` to a notice (decision 2).
 */
export const routes: Routes = [
  {
    // Home: until web stage WE builds the feed (W1), the region's binders on its map.
    path: '',
    pathMatch: 'full',
    title: 'Home',
    // The landing: the one page indexed with the legal pages (decision 6).
    data: { shell: HOME, seo: 'index' },
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/map/map-page.component').then((m) => m.MapPageComponent),
  },
  { path: 'map', pathMatch: 'full', children: [], canActivate: [mapRedirect] },
  {
    path: 'inventory',
    title: 'Inventory',
    data: { shell: INVENTORY },
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/inventory/inventory-page.component').then((m) => m.InventoryPageComponent),
  },
  {
    path: 'binders/:id',
    title: 'Binder',
    data: { shell: DISCOVERY_PAGE },
    canActivate: [accountStateGuard],
    loadComponent: () =>
      import('./features/binders/public-binder-page.component').then(
        (m) => m.PublicBinderPageComponent,
      ),
  },
  {
    path: 'search',
    title: 'Search',
    data: { shell: SEARCH },
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/search/search-page.component').then((m) => m.SearchPageComponent),
  },
  {
    path: 'cards',
    data: { shell: DISCOVERY_PAGE },
    canActivate: [onboardingGuard],
    loadChildren: () => import('./features/catalog/catalog.routes').then((m) => m.CATALOG_ROUTES),
  },
  {
    path: 'sets/:id',
    title: 'Set',
    data: { shell: DISCOVERY_PAGE },
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/catalog/set-detail/set-detail-page.component').then(
        (m) => m.SetDetailPageComponent,
      ),
  },
  { path: 'community', children: [{ path: '**', children: [] }], canActivate: [communityRedirect] },
  { path: 'wishlist', children: [{ path: '**', children: [] }], canActivate: [wishlistRedirect] },
  {
    path: 'notifications',
    title: 'Notifications',
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/notifications/notifications-page.component').then(
        (m) => m.NotificationsPageComponent,
      ),
  },
  {
    path: 'messages',
    title: 'Messages',
    data: { shell: MESSAGES },
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/messages/messages-page.component').then((m) => m.MessagesPageComponent),
  },
  {
    path: 'messages/community/:room',
    title: 'Community',
    data: { shell: MESSAGES },
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/messages/messages-page.component').then((m) => m.MessagesPageComponent),
  },
  {
    path: 'messages/:id',
    title: 'Messages',
    data: { shell: MESSAGES },
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/messages/messages-page.component').then((m) => m.MessagesPageComponent),
  },
  // Offers, trades, checkout and disputes left the web (decision 2, ADR 0018).
  { path: 'offers', children: [{ path: '**', children: [] }], canActivate: [offersGoneRedirect] },
  { path: 'trades', children: [{ path: '**', children: [] }], canActivate: [offersGoneRedirect] },
  ...['checkout', 'disputes'].map((path) => ({
    path,
    title: 'Deals happen in the chat',
    children: [
      {
        path: '**',
        loadComponent: () =>
          import('./features/notice/payments-notice-page.component').then(
            (m) => m.PaymentsNoticePageComponent,
          ),
      },
    ],
  })),
  {
    path: 'profile',
    title: 'Profile',
    data: { shell: PROFILE },
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./features/profile/my-profile-page.component').then((m) => m.MyProfilePageComponent),
  },
  {
    path: 'collectors/:handle',
    title: 'Collector',
    canActivate: [accountStateGuard],
    loadComponent: () =>
      import('./features/collectors/collector-page.component').then(
        (m) => m.CollectorPageComponent,
      ),
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'onboarding',
    title: 'Welcome',
    canActivate: [authGuard, accountGuard],
    loadComponent: () =>
      import('./features/onboarding/onboarding-page.component').then(
        (m) => m.OnboardingPageComponent,
      ),
  },
  {
    path: 'settings',
    data: { shell: PROFILE },
    canActivate: [accountGuard],
    loadChildren: () =>
      import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: 'legal',
    data: { seo: 'index' },
    loadChildren: () => import('./features/legal/legal.routes').then((m) => m.LEGAL_ROUTES),
  },
  {
    path: '**',
    title: 'Page not found',
    loadComponent: () =>
      import('./features/not-found/not-found-page.component').then((m) => m.NotFoundPageComponent),
  },
];
