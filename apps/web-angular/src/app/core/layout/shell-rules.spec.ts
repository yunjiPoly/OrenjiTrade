import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { indexable } from '../routing/orenji-title.strategy';
import { SHELL_AREAS, areaOfKey, badgeText, messagesLabel } from './nav-links';
import { routes } from '../../app.routes';
import { SHELL_DEFAULTS, ShellRouteData, shellDataOf } from './shell-layout.service';

/** A chain of route snapshots from the root down, each with its own `data`. */
function chain(...datas: (Record<string, unknown> | undefined)[]): ActivatedRouteSnapshot {
  let child: ActivatedRouteSnapshot | null = null;
  for (const data of [...datas].reverse()) {
    child = {
      routeConfig: data ? { data } : {},
      firstChild: child,
    } as unknown as ActivatedRouteSnapshot;
  }
  return child!;
}

describe('the shell rules (web redesign WA)', () => {
  it('lists the five areas in the phone’s order with the "g then a letter" keys (spec 4.6, 4.9)', () => {
    expect(SHELL_AREAS.map((a) => [a.label, a.path, a.key])).toEqual([
      ['Home', '/', 'h'],
      ['Search', '/search', 's'],
      ['Inventory', '/inventory', 'i'],
      ['Messages', '/messages', 'm'],
      ['Profile', '/profile', 'p'],
    ]);
    expect(areaOfKey('I')?.area).toBe('inventory');
    expect(areaOfKey('x')).toBeUndefined();
  });

  it('names the Messages badge by unread chats, and caps its text at 99+', () => {
    expect(messagesLabel(0)).toBe('Messages');
    expect(messagesLabel(1)).toBe('Messages, 1 unread chat');
    expect(messagesLabel(2)).toBe('Messages, 2 unread chats');
    expect(badgeText(7)).toBe('7');
    expect(badgeText(140)).toBe('99+');
  });

  it('merges data.shell from the root to the deepest route', () => {
    expect(shellDataOf(null)).toEqual(SHELL_DEFAULTS);
    expect(shellDataOf(chain(undefined))).toEqual(SHELL_DEFAULTS);
    const merged = shellDataOf(
      chain({ shell: { area: 'search', pills: 'region', layout: 'reading' } }, undefined, {
        shell: { pills: 'both' },
      }),
    );
    expect(merged).toEqual({ ...SHELL_DEFAULTS, area: 'search', pills: 'both', layout: 'reading' });
  });

  it('gives every Messages route the workspace layout (no footer, spec 4.10) and /admin its rail item', () => {
    const shellOf = (path: string) =>
      routes.find((route) => route.path === path)?.data?.['shell'] as ShellRouteData | undefined;
    for (const path of ['messages', 'messages/community/:room', 'messages/:id']) {
      expect(shellOf(path), path).toMatchObject({ area: 'messages', layout: 'workspace' });
    }
    expect(shellOf('admin')).toMatchObject({ area: 'admin' });
  });

  it('marks the five tabs’ own pages, and only them, for the phone’s per-tab bar below 960 (spec 16)', () => {
    const shellOf = (path: string) =>
      routes.find((route) => route.path === path)?.data?.['shell'] as ShellRouteData | undefined;
    for (const path of [
      '',
      'search',
      'inventory',
      'messages',
      'messages/community/:room',
      'messages/:id',
      'profile',
    ]) {
      expect(shellOf(path)?.tabBar, path || '/').toBe(true);
    }
    for (const path of [
      'binders/:id',
      'cards',
      'sets/:id',
      'notifications',
      'collectors/:handle',
      'settings',
      'admin',
      'legal',
    ]) {
      expect(shellOf(path)?.tabBar ?? false, path).toBe(false);
    }
  });

  it('indexes only the routes that say so (decision 6: the landing and legal pages)', () => {
    const state = (root: ActivatedRouteSnapshot) => ({ root }) as RouterStateSnapshot;
    expect(indexable(state(chain(undefined, { shell: {} })))).toBe(false);
    expect(indexable(state(chain(undefined, { seo: 'index' }, undefined)))).toBe(true);
  });
});
