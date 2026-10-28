import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideApiClient } from '../../api/provide-api-client';
import { AuthService } from '../../auth/auth.service';
import { SessionService, SessionStatus } from '../../auth/session.service';
import { ShellLayout } from '../shell-layout.service';
import { AppShellComponent } from './app-shell.component';

@Component({ template: '<h1>Page</h1>' })
class PageComponent {}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

describe('AppShellComponent (spec 4, boards W1 and W3)', () => {
  let fixture: ComponentFixture<AppShellComponent>;
  let element: HTMLElement;
  const isAuthenticated = signal(false);
  const authState = signal<'loading' | 'authenticated' | 'anonymous'>('anonymous');
  const status = signal<SessionStatus>('anonymous');

  beforeEach(async () => {
    isAuthenticated.set(false);
    authState.set('anonymous');
    status.set('anonymous');
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        provideRouter([
          {
            path: '',
            component: PageComponent,
            data: { shell: { area: 'home', pills: 'both', layout: 'workspace' } },
          },
          {
            path: 'search',
            component: PageComponent,
            data: {
              shell: { area: 'search', pills: 'both', layout: 'workspace', hideGlobalSearch: true },
            },
          },
          {
            path: 'cards/:id',
            component: PageComponent,
            data: { shell: { area: 'search', pills: 'region', layout: 'reading' } },
          },
          {
            path: 'inventory',
            component: PageComponent,
            data: { shell: { area: 'inventory', pills: 'none', layout: 'workspace' } },
          },
          { path: 'legal', component: PageComponent },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClient(),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated,
            authState,
            user: signal(null),
            ready: async () => undefined,
          },
        },
        {
          provide: SessionService,
          useValue: {
            status,
            me: signal(null),
            error: signal(null),
            refreshing: signal(false),
            handle: signal(null),
            displayName: signal('Guest'),
            canAccessAdmin: signal(false),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AppShellComponent);
    element = fixture.nativeElement as HTMLElement;
    await settle(fixture);
  });

  async function go(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await settle(fixture);
  }

  it('starts with "Skip to content", then the top bar, the rail and the main content', () => {
    const first = element.querySelector('a');
    expect(first?.textContent?.trim()).toBe('Skip to content');
    expect(first?.getAttribute('href')).toBe('#main-content');
    expect(element.querySelector('header[data-testid="top-bar"]')).not.toBeNull();
    expect(element.querySelector('nav[aria-label="Main"]')).not.toBeNull();
    expect(element.querySelector('main#main-content')?.getAttribute('tabindex')).toBe('-1');
    const wordmark = element.querySelector<HTMLAnchorElement>('a[aria-label="OrenjiTrade, Home"]');
    expect(wordmark?.getAttribute('href')).toBe('/');
  });

  it('adds "Skip the map" while a page shows the map', async () => {
    expect(element.querySelector('[data-testid="skip-map"]')).toBeNull();
    TestBed.inject(ShellLayout).setSkipMapTarget('map-list');
    await settle(fixture);
    const skip = element.querySelector('[data-testid="skip-map"]');
    expect(skip?.textContent?.trim()).toBe('Skip the map');
    expect(skip?.getAttribute('href')).toBe('#map-list');
  });

  it('shows the pills in each page’s scope (spec 4.2)', async () => {
    const pills = () => ({
      region: !!element.querySelector('[data-testid="region-pill"]'),
      game: !!element.querySelector('[data-testid="game-pill"]'),
    });
    await go('/');
    expect(pills()).toEqual({ region: true, game: true });
    await go('/cards/c-1');
    expect(pills()).toEqual({ region: true, game: false });
    await go('/inventory');
    expect(pills()).toEqual({ region: false, game: false });
  });

  it('hides the top bar’s search on Search, whose pane has its own', async () => {
    await go('/inventory');
    expect(element.querySelector('#global-search-input')).not.toBeNull();
    await go('/search');
    expect(element.querySelector('#global-search-input')).toBeNull();
  });

  it('ends reading pages with the footer, never workspace pages (spec 4.10)', async () => {
    await go('/legal');
    expect(element.querySelector('footer')).not.toBeNull();
    await go('/inventory');
    expect(element.querySelector('footer')).toBeNull();
  });

  it('gives a guest a "Sign in" pill instead of the bell and the avatar (spec 4.3)', async () => {
    expect(element.querySelector('[data-testid="top-bar-sign-in"]')?.getAttribute('href')).toBe(
      '/auth/sign-in',
    );
    expect(element.querySelector('[data-testid="notification-bell"]')).toBeNull();
    expect(element.querySelector('[data-testid="account-menu-trigger"]')).toBeNull();
  });

  it('keeps every icon-only control named', () => {
    for (const button of Array.from(element.querySelectorAll('button, a'))) {
      const name = button.getAttribute('aria-label') ?? button.textContent?.trim();
      expect(name, button.outerHTML.slice(0, 80)).toBeTruthy();
    }
  });
});
