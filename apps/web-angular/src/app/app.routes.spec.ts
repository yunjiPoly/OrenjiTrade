import { ActivatedRouteSnapshot, Route, UrlSegment, convertToParamMap } from '@angular/router';
import { messagesMatcher, routes } from './app.routes';
import { ShellRouteData } from './core/layout/shell-layout.service';

function route(path: string): Route {
  const found = routes.find(
    (entry) => entry.path === path || (path === 'messages' && entry.matcher === messagesMatcher),
  );
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
  });

  it('serves /messages, /messages/:id and a community room from one route, so the page is reused (WC review F5, WF)', () => {
    const segments = (url: string) => url.split('/').map((path) => new UrlSegment(path, {}));
    expect(messagesMatcher(segments('messages'))?.posParams).toBeUndefined();
    expect(messagesMatcher(segments('messages'))?.consumed).toHaveLength(1);
    expect(messagesMatcher(segments('messages/c-1'))?.posParams?.['id']?.path).toBe('c-1');
    const room = messagesMatcher(segments('messages/community/americas-north-yugioh'));
    expect(room?.posParams?.['room']?.path).toBe('americas-north-yugioh');
    expect(room?.consumed).toHaveLength(3);
    expect(messagesMatcher(segments('messages/c-1/other'))).toBeNull();
    expect(messagesMatcher(segments('messages/community/a/b'))).toBeNull();
    expect(messagesMatcher(segments('notifications'))).toBeNull();
    // The matcher is the only Messages route; a room's tab says "Community".
    const messages = routes.filter(
      (entry) => entry.path?.startsWith('messages') || entry.matcher === messagesMatcher,
    );
    expect(messages.map((entry) => entry.path ?? 'matcher')).toEqual(['matcher']);
    const title = messages[0].title as (route: ActivatedRouteSnapshot) => string;
    const snapshot = (params: Record<string, string>) =>
      ({ paramMap: convertToParamMap(params) }) as ActivatedRouteSnapshot;
    expect(title(snapshot({ room: 'americas-north-yugioh' }))).toBe('Community');
    expect(title(snapshot({ id: 'c-1' }))).toBe('Messages');
  });
});
