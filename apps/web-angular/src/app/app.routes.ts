import { Routes } from '@angular/router';
import {
  accountGuard,
  accountStateGuard,
  adminGuard,
  authGuard,
  onboardingGuard,
} from './core/auth/auth.guards';
import { FEATURE } from './core/feature-flags/feature-flags.service';
import { featureGuard } from './core/feature-flags/feature.guard';

/**
 * Top-level routes. Every page is lazy (`loadComponent` / `loadChildren`) so the initial bundle
 * only carries the shell. Titles feed `OrenjiTitleStrategy`.
 *
 * Guards: public product pages use `onboardingGuard` (anonymous visitors pass; signed-in
 * collectors must have accepted the terms and finished onboarding), account pages use
 * `accountGuard`, the admin console `adminGuard`.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'map' },
  {
    path: 'map',
    title: 'Map',
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/map/map-page.component').then((m) => m.MapPageComponent),
  },
  {
    path: 'inventory',
    title: 'Inventory',
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/inventory/inventory-page.component').then((m) => m.InventoryPageComponent),
  },
  {
    path: 'binders/:id',
    title: 'Binder',
    canActivate: [accountStateGuard],
    loadComponent: () =>
      import('./features/binders/public-binder-page.component').then(
        (m) => m.PublicBinderPageComponent,
      ),
  },
  {
    path: 'search',
    title: 'Search',
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/search/search-page.component').then((m) => m.SearchPageComponent),
  },
  {
    path: 'cards',
    canActivate: [onboardingGuard],
    loadChildren: () => import('./features/catalog/catalog.routes').then((m) => m.CATALOG_ROUTES),
  },
  {
    path: 'sets/:id',
    title: 'Set',
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/catalog/set-detail/set-detail-page.component').then(
        (m) => m.SetDetailPageComponent,
      ),
  },
  {
    path: 'premium',
    title: 'Premium',
    canActivate: [accountStateGuard],
    loadComponent: () =>
      import('./features/premium/premium-page.component').then((m) => m.PremiumPageComponent),
  },
  {
    path: 'community',
    title: 'Community',
    canActivate: [onboardingGuard, featureGuard(FEATURE.publicChat, 'Community')],
    loadComponent: () =>
      import('./features/community/community-page.component').then((m) => m.CommunityPageComponent),
  },
  {
    path: 'wishlist',
    title: 'Wishlist',
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/wishlist/wishlist-page.component').then((m) => m.WishlistPageComponent),
  },
  {
    path: 'messages',
    title: 'Messages',
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/messages/messages-page.component').then((m) => m.MessagesPageComponent),
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
    loadChildren: () => import('./features/legal/legal.routes').then((m) => m.LEGAL_ROUTES),
  },
  {
    path: '**',
    title: 'Page not found',
    loadComponent: () =>
      import('./features/not-found/not-found-page.component').then((m) => m.NotFoundPageComponent),
  },
];
