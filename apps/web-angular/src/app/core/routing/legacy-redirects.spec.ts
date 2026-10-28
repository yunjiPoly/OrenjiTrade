import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ToastService } from '../feedback/toast.service';
import {
  OFFERS_GONE_TOAST,
  PAYMENTS_NOTICE,
  cardsQueryRedirect,
  communityRedirect,
  mapRedirect,
  offersGoneRedirect,
  wishlistRedirect,
} from './legacy-redirects';

@Component({ template: 'page' })
class PageComponent {}

const routes: Routes = [
  { path: 'search', component: PageComponent },
  { path: 'messages', component: PageComponent },
  { path: 'map', pathMatch: 'full', children: [], canActivate: [mapRedirect] },
  { path: 'cards', canActivate: [cardsQueryRedirect], component: PageComponent },
  { path: 'community', children: [{ path: '**', children: [] }], canActivate: [communityRedirect] },
  { path: 'wishlist', children: [{ path: '**', children: [] }], canActivate: [wishlistRedirect] },
  { path: 'offers', children: [{ path: '**', children: [] }], canActivate: [offersGoneRedirect] },
  { path: 'trades', children: [{ path: '**', children: [] }], canActivate: [offersGoneRedirect] },
];

describe('old links of the web (spec 4.11, decision 2)', () => {
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  async function land(url: string): Promise<string> {
    await harness.navigateByUrl(url);
    return router.url;
  }

  it('sends the map to Search › Binders, keeping the region and the state', async () => {
    expect(await land('/map')).toBe('/search?tab=binders');
    expect(await land('/map?region=europe&subdivision=FR-IDF')).toBe(
      '/search?tab=binders&region=europe&state=FR-IDF',
    );
  });

  it('sends a card search to Search › Cards; the catalogue without a text stays', async () => {
    expect(await land('/cards?q=Yubel')).toBe('/search?tab=cards&q=Yubel');
    // The catalogue's own text search (a reload, a bookmark) stays on the catalogue.
    expect(await land('/cards?text=Yubel&set=AZR')).toBe('/cards?text=Yubel&set=AZR');
    expect(await land('/cards')).toBe('/cards');
  });

  it('sends the wishlist and the community to their new homes', async () => {
    expect(await land('/wishlist')).toBe('/search?tab=wishlist');
    expect(await land('/wishlist/w-1')).toBe('/search?tab=wishlist');
    expect(await land('/community')).toBe('/messages?tab=community');
    expect(await land('/community/americas-north')).toBe('/messages?tab=community');
  });

  it('sends offers and trades to Messages with the toast', async () => {
    const toasts = TestBed.inject(ToastService);
    expect(await land('/offers')).toBe('/messages');
    expect(await land('/offers/o-1')).toBe('/messages');
    expect(await land('/trades/t-1')).toBe('/messages');
    expect(toasts.toasts().map((t) => t.title)).toEqual([
      OFFERS_GONE_TOAST,
      OFFERS_GONE_TOAST,
      OFFERS_GONE_TOAST,
    ]);
    expect(OFFERS_GONE_TOAST).toBe('Offers are no longer available. Deals happen in the chat.');
  });

  it('words the payments notice as the spec does', () => {
    expect(PAYMENTS_NOTICE).toBe(
      "Payments and disputes aren't part of OrenjiTrade. Deals happen in the chat, and the buyer pays by e-Transfer outside the app.",
    );
  });
});
