import { Route } from '@angular/router';
import { routes } from './app.routes';
import { ShellRouteData } from './core/layout/shell-layout.service';

function route(path: string): Route {
  const found = routes.find((entry) => entry.path === path);
  expect(found, path).toBeTruthy();
  return found!;
}

const shell = (path: string) => route(path).data?.['shell'] as ShellRouteData | undefined;

describe('the routes of the web redesign (spec 4.11)', () => {
  it('loads every page lazily (no page in the initial bundle, spec 21)', () => {
    for (const entry of routes) {
      expect(entry.component, `route ${entry.path}`).toBeUndefined();
    }
  });

  it('puts the five areas, their pills and their layouts in the routes', () => {
    expect(shell('')).toEqual({ area: 'home', pills: 'both', layout: 'workspace', tabBar: true });
    expect(shell('search')).toMatchObject({
      area: 'search',
      pills: 'both',
      layout: 'workspace',
      hideGlobalSearch: true,
    });
    for (const page of ['cards', 'sets/:id', 'binders/:id']) {
      expect(shell(page)).toMatchObject({ area: 'search', pills: 'region', layout: 'reading' });
    }
    expect(shell('inventory')).toMatchObject({
      area: 'inventory',
      pills: 'none',
      layout: 'workspace',
    });
    expect(shell('messages')).toMatchObject({
      area: 'messages',
      pills: 'none',
      layout: 'workspace',
    });
    expect(shell('profile')).toMatchObject({ area: 'profile', pills: 'none' });
    expect(shell('settings')).toMatchObject({ area: 'profile', pills: 'none' });
    expect(shell('notifications')).toBeUndefined();
  });

  it('indexes only the landing and the legal pages (decision 6)', () => {
    const indexed = routes.filter((entry) => entry.data?.['seo'] === 'index').map((e) => e.path);
    expect(indexed).toEqual(['', 'legal']);
  });

  it('keeps old links working: map, wishlist, community, offers, trades, checkout, disputes', () => {
    for (const path of ['map', 'wishlist', 'community', 'offers', 'trades']) {
      expect(route(path).canActivate?.length, path).toBe(1);
      expect(route(path).loadComponent).toBeUndefined();
    }
    for (const path of ['checkout', 'disputes']) {
      const notice = route(path).children?.[0];
      expect(notice?.path).toBe('**');
      expect(notice?.loadComponent).toBeTruthy();
    }
    expect(route('messages/community/:room').loadComponent).toBeTruthy();
  });
});
