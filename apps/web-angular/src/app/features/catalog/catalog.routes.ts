import { Routes } from '@angular/router';

/** `/cards` (search) and `/cards/:id` (detail). Public; the parent route applies the guards. */
export const CATALOG_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Cards',
    loadComponent: () =>
      import('./card-search/card-search-page.component').then((m) => m.CardSearchPageComponent),
  },
  {
    path: ':id',
    title: 'Card',
    loadComponent: () =>
      import('./card-detail/card-detail-page.component').then((m) => m.CardDetailPageComponent),
  },
];
