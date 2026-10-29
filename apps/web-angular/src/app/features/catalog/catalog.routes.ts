import { Routes } from '@angular/router';
import { cardsQueryRedirect } from '../../core/routing/legacy-redirects';

/**
 * `/cards` (the catalogue) and `/cards/:id` (Who has this card, web stage WD). Public; the parent
 * route applies the guards.
 */
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
      import('./card-page/card-page.component').then((m) => m.CardPageComponent),
  },
];
