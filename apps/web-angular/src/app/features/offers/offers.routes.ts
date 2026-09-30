import { Routes } from '@angular/router';
import { authGuard, onboardingGuard } from '../../core/auth/auth.guards';

/** `/offers` (inbox) and `/offers/:id` (one proposal; signed-in parties only). */
export const OFFERS_ROUTES: Routes = [
  {
    path: '',
    title: 'Offers',
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./inbox/offers-inbox-page.component').then((m) => m.OffersInboxPageComponent),
  },
  {
    path: ':id',
    title: 'Offer',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () => import('./detail/offer-page.component').then((m) => m.OfferPageComponent),
  },
];
