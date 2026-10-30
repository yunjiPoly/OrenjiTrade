import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Route } from '@angular/router';
import { accountGuard } from '../../core/auth/auth.guards';
import { AuthService } from '../../core/auth/auth.service';
import { SETTINGS_ROUTES, settingsHome } from './settings.routes';

describe('the Settings routes (spec 13 and 14)', () => {
  const sections = (SETTINGS_ROUTES[0].children ?? []).filter(
    (route): route is Route & { path: string } => !!route.path && !!route.loadComponent,
  );

  it("keeps every section the account's, except Appearance and Legal a guest may open", () => {
    const open = sections
      .filter((route) => !(route.canActivate ?? []).includes(accountGuard))
      .map((route) => route.path);
    expect(open).toEqual(['appearance', 'legal']);
    expect(sections.length).toBeGreaterThan(8);
  });

  it('opens on Profile for a collector and on Appearance for a guest', () => {
    const authenticated = signal(true);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { isAuthenticated: authenticated } }],
    });
    expect(TestBed.runInInjectionContext(() => settingsHome())).toBe('profile');
    authenticated.set(false);
    expect(TestBed.runInInjectionContext(() => settingsHome())).toBe('appearance');
  });
});
