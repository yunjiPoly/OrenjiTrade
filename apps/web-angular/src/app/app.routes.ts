import { ActivatedRouteSnapshot, Routes, UrlMatchResult, UrlSegment } from '@angular/router';
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

/**
 * `messages`, `messages/:id` and `messages/community/:room` (one route config, so the router reuses
 * the page between a chat, the inbox and a community room: the focus can go back to the row that
 * opened a room or a chat below 960; WC review F5, web WF).
 */
export function messagesMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments[0]?.path !== 'messages' || segments.length > 3) {
    return null;
  }
  if (segments.length === 3) {
    return segments[1].path === 'community'
      ? { consumed: segments, posParams: { room: segments[2] } }
      : null;
  }
  return segments.length === 2
    ? { consumed: segments, posParams: { id: segments[1] } }
    : { consumed: segments };
}

/** "Community" in a room's tab title, "Messages" otherwise. */
export function messagesTitle(route: ActivatedRouteSnapshot): string {
  return route.paramMap.has('room') ? 'Community' : 'Messages';
}

/**
 * `data.shell` of the web redesign's areas (spec 4.2 pill scope, 4.6 rail, 4.10 footer); `tabBar`
 * marks the five tabs' own pages, whose top bar below 960 is the phone's per-tab bar (spec 16).
 */
const HOME: ShellRouteData = { area: 'home', pills: 'both', layout: 'workspace', tabBar: true };
const SEARCH: ShellRouteData = {
  area: 'search',
  pills: 'both',
  layout: 'workspace',
  pageSearch: true,
  hideGlobalSearch: true,
  tabBar: true,
};
const DISCOVERY_PAGE: ShellRouteData = { area: 'search', pills: 'region', layout: 'reading' };
const INVENTORY: ShellRouteData = {
  area: 'inventory',
  pills: 'none',
  layout: 'workspace',
  pageSearch: true,
  tabBar: true,
};
const MESSAGES: ShellRouteData = {
  area: 'messages',
  pills: 'none',
  layout: 'workspace',
  tabBar: true,
};
/** Settings belongs to Profile too, but keeps the bar with the wordmark below 960. */
const PROFILE: ShellRouteData = { area: 'profile', pills: 'none', layout: 'reading' };
const PROFILE_TAB: ShellRouteData = { ...PROFILE, tabBar: true };
/** The sign-in steps, the account states and the welcome: pages of their own (spec 14). */
const BARE: ShellRouteData = { bare: true };

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
    // Home (web stage WE, spec 5, boards W1 and W2): what's new in the region and game.
    path: '',
    pathMatch: 'full',
    title: 'Home',
    // The landing: the one page indexed with the legal pages (decision 6).
    data: { shell: HOME, seo: 'index' },
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/home/home-page.component').then((m) => m.HomePageComponent),
  },
  { path: 'map', pathMatch: 'full', children: [], canActivate: [mapRedirect] },
  {
    path: 'inventory',
    title: 'Inventory',
    data: { shell: INVENTORY },
    canActivate: [onboardingGuard],
    loadChildren: () =>
      import('./features/inventory/inventory.routes').then((m) => m.INVENTORY_ROUTES),
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
      import('./features/catalog/set-page/set-page.component').then((m) => m.SetPageComponent),
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
    // `/messages`, `/messages/:id` and `/messages/community/:room` are one route: the page (and
    // the focused inbox or room row) stays when a chat or a room opens or Back closes it (spec
    // 10.2 and 10.7; WC review F5, U3, A1; web WF).
    matcher: messagesMatcher,
    title: messagesTitle,
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
    data: { shell: PROFILE_TAB },
    // A guest reads Profile's guest page (spec 14), with Appearance, Trading safely and Legal.
    canActivate: [onboardingGuard],
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
    // The sign-in steps and the account states stand alone (spec 14: no rail, no top bar).
    data: { shell: BARE },
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'onboarding',
    title: 'Welcome',
    data: { shell: BARE },
    canActivate: [authGuard, accountGuard],
    loadComponent: () =>
      import('./features/onboarding/onboarding-page.component').then(
        (m) => m.OnboardingPageComponent,
      ),
  },
  {
    path: 'settings',
    data: { shell: PROFILE },
    // Appearance and Legal open to guests too (spec 14); every other section is the account's.
    canActivate: [accountStateGuard],
    loadChildren: () =>
      import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
  },
  {
    path: 'admin',
    // The rail's Admin item is the current one (WH1 rebuilds the console's own shell).
    data: { shell: { area: 'admin' } satisfies ShellRouteData },
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
