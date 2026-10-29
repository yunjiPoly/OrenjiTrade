import { Routes } from '@angular/router';
import { cardsQueryRedirect } from '../../core/routing/legacy-redirects';

/** `/cards` (search) and `/cards/:id` (detail). Public; the parent route applies the guards. */
export const CATALOG_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Cards',
    // `/cards?q=` opens Search › Cards (spec 4.11); the catalogue without a text stays here.
    canActivate: [cardsQueryRedirect],
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
