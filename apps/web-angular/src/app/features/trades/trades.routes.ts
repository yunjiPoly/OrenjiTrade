import { Routes } from '@angular/router';
import { authGuard, onboardingGuard } from '../../core/auth/auth.guards';

/** `/trades` (list) and `/trades/:id` (one trade; signed-in parties only). */
export const TRADES_ROUTES: Routes = [
  {
    path: '',
    title: 'Trades',
    canActivate: [onboardingGuard],
    loadComponent: () => import('./list/trades-page.component').then((m) => m.TradesPageComponent),
  },
  {
    path: ':id',
    title: 'Trade',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () => import('./detail/trade-page.component').then((m) => m.TradePageComponent),
  },
];
