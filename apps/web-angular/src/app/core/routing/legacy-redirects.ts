import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { ToastService } from '../feedback/toast.service';

/** The toast of an old offer or trade link (spec 4.11, decision 2). */
export const OFFERS_GONE_TOAST = 'Offers are no longer available. Deals happen in the chat.';

/** The notice of an old checkout or dispute link (spec 4.11). */
export const PAYMENTS_NOTICE =
  "Payments and disputes aren't part of OrenjiTrade. Deals happen in the chat, and the buyer pays by e-Transfer outside the app.";

function param(route: ActivatedRouteSnapshot, name: string): string | null {
  const value = route.queryParamMap.get(name);
  return value && value.trim() ? value.trim() : null;
}

/** `/offers*` and `/trades*` → `/messages`, with the toast (spec 4.11). */
export function offersGoneRedirect(): UrlTree {
  inject(ToastService).show({ title: OFFERS_GONE_TOAST, tone: 'info' });
  return inject(Router).createUrlTree(['/messages']);
}

/** `/map?region&subdivision` → `/search?tab=binders&region&state` (spec 4.11; the map is Binders' until WD). */
export function mapRedirect(route: ActivatedRouteSnapshot): UrlTree {
  const queryParams: Record<string, string> = { tab: 'binders' };
  const region = param(route, 'region');
  const state = param(route, 'subdivision') ?? param(route, 'state');
  if (region) {
    queryParams['region'] = region;
  }
  if (state) {
    queryParams['state'] = state;
  }
  return inject(Router).createUrlTree(['/search'], { queryParams });
}

/**
 * `/cards?q=` → `/search?tab=cards&q=` (spec 4.11); `/cards` without `q` stays the catalogue,
 * whose own text search writes `text=` so its links and reloads stay on the catalogue.
 */
export function cardsQueryRedirect(route: ActivatedRouteSnapshot): true | UrlTree {
  const q = param(route, 'q');
  return q ? inject(Router).createUrlTree(['/search'], { queryParams: { tab: 'cards', q } }) : true;
}

/** `/wishlist[/:id]` → `/search?tab=wishlist` (spec 4.11). */
export function wishlistRedirect(): UrlTree {
  return inject(Router).createUrlTree(['/search'], { queryParams: { tab: 'wishlist' } });
}

/** `/community[/:slug]` → `/messages?tab=community` (spec 4.11). */
export function communityRedirect(): UrlTree {
  return inject(Router).createUrlTree(['/messages'], { queryParams: { tab: 'community' } });
}
