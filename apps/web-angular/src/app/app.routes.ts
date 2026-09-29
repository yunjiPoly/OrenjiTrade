import { Routes } from '@angular/router';

/**
 * Top-level routes. Every page is lazy (`loadComponent` / `loadChildren`) so the initial bundle
 * only carries the shell. Titles feed `OrenjiTitleStrategy`.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'map' },
  {
    path: 'map',
    title: 'Map',
    loadComponent: () =>
      import('./features/map/map-page.component').then((m) => m.MapPageComponent),
  },
  {
    path: 'inventory',
    title: 'Inventory',
    loadComponent: () =>
      import('./features/inventory/inventory-page.component').then((m) => m.InventoryPageComponent),
  },
  {
    path: 'search',
    title: 'Search',
    loadComponent: () =>
      import('./features/search/search-page.component').then((m) => m.SearchPageComponent),
  },
  {
    path: 'community',
    title: 'Community',
    loadComponent: () =>
      import('./features/community/community-page.component').then((m) => m.CommunityPageComponent),
  },
  {
    path: 'wishlist',
    title: 'Wishlist',
    loadComponent: () =>
      import('./features/wishlist/wishlist-page.component').then((m) => m.WishlistPageComponent),
  },
  {
    path: 'messages',
    title: 'Messages',
    loadComponent: () =>
      import('./features/messages/messages-page.component').then((m) => m.MessagesPageComponent),
  },
  {
    path: 'collectors/:id',
    title: 'Collector',
    loadComponent: () =>
      import('./features/collectors/collector-page.component').then(
        (m) => m.CollectorPageComponent,
      ),
  },
  {
    path: 'settings',
    title: 'Settings',
    loadComponent: () =>
      import('./features/settings/settings-page.component').then((m) => m.SettingsPageComponent),
  },
  {
    path: 'admin',
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
