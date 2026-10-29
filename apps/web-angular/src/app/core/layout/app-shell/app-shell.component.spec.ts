import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NEVER, Subject } from 'rxjs';
import { provideApiClient } from '../../api/provide-api-client';
import { AuthService } from '../../auth/auth.service';
import { SessionService, SessionStatus } from '../../auth/session.service';
import { NotificationCenter } from '../../notifications/notification-center.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { NARROW_QUERY, ShellLayout } from '../shell-layout.service';
import { ShellTabTitleDirective } from '../shell-tab-title.directive';
import { AppShellComponent } from './app-shell.component';

@Component({ template: '<h1>Page</h1>' })
class PageComponent {}

/** A tab's own page with its title (Inventory's, say). */
@Component({
  imports: [ShellTabTitleDirective],
  template: '<h1 appShellTabTitle>Inventory</h1>',
})
class TabPageComponent {}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

const isAuthenticated = signal(false);
const authState = signal<'loading' | 'authenticated' | 'anonymous'>('anonymous');
const status = signal<SessionStatus>('anonymous');

/** The shell's providers: a fake router of the five kinds of pages and a fake session. */
function shellProviders(): unknown[] {
  return [
    provideRouter([
      {
        path: '',
        component: PageComponent,
        data: { shell: { area: 'home', pills: 'both', layout: 'workspace', tabBar: true } },
      },
      {
        path: 'search',
        component: PageComponent,
        data: {
          shell: {
            area: 'search',
            pills: 'both',
            layout: 'workspace',
            hideGlobalSearch: true,
            tabBar: true,
          },
        },
      },
      {
        path: 'cards/:id',
        component: PageComponent,
        data: { shell: { area: 'search', pills: 'region', layout: 'reading' } },
      },
      {
        path: 'inventory',
        component: TabPageComponent,
        data: { shell: { area: 'inventory', pills: 'none', layout: 'workspace', tabBar: true } },
      },
      {
        path: 'profile',
        component: PageComponent,
        data: { shell: { area: 'profile', pills: 'none', layout: 'reading', tabBar: true } },
      },
      {
        path: 'settings',
        component: PageComponent,
        data: { shell: { area: 'profile', pills: 'none', layout: 'reading' } },
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
        changes$: new Subject(),
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
  ];
}

describe('AppShellComponent (spec 4, boards W1 and W3)', () => {
  let fixture: ComponentFixture<AppShellComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    isAuthenticated.set(false);
    authState.set('anonymous');
    status.set('anonymous');
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: shellProviders(),
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

  it('keeps the wordmark and each page’s own title at 960 and wider, with no tab title', async () => {
    await go('/inventory');
    expect(element.querySelector('[data-testid="tab-title"]')).toBeNull();
    expect(element.querySelector('a[aria-label="OrenjiTrade, Home"]')).not.toBeNull();
    expect(element.querySelector('main h1')?.classList.contains('visually-hidden')).toBe(false);
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

describe('AppShellComponent below 960: the phone’s per-tab bars (spec 16, board W29)', () => {
  let fixture: ComponentFixture<AppShellComponent>;
  let element: HTMLElement;
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');

  beforeEach(async () => {
    // A window narrower than 960 px (spec 3).
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query === NARROW_QUERY,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
    isAuthenticated.set(true);
    authState.set('authenticated');
    status.set('ready');
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        ...shellProviders(),
        {
          provide: NotificationCenter,
          useValue: {
            active: signal(true),
            unreadCount: signal(0),
            recent: signal(null),
            recentStatus: signal('idle'),
            lastPush: signal(null),
          },
        },
        {
          provide: RealtimeService,
          useValue: {
            state: signal('connected'),
            messages$: NEVER,
            receipts$: NEVER,
            resync$: NEVER,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AppShellComponent);
    element = fixture.nativeElement as HTMLElement;
    await settle(fixture);
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(window, 'matchMedia', original);
    } else {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  async function go(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await settle(fixture);
  }

  function bar() {
    const top = element.querySelector('[data-testid="top-bar"]')!;
    return {
      title: top.querySelector('[data-testid="tab-title"]')?.textContent?.trim() ?? null,
      wordmark: !!top.querySelector('a[aria-label="OrenjiTrade, Home"]'),
      region: !!top.querySelector('[data-testid="region-pill"]'),
      game: !!top.querySelector('[data-testid="game-pill"]'),
      bell: !!top.querySelector('[data-testid="notification-bell"]'),
      account: !!top.querySelector('[data-testid="account-menu-trigger"]'),
    };
  }

  it('gives Inventory its title and the bell, no wordmark and no avatar; the tab bar, no rail', async () => {
    await go('/inventory');
    expect(bar()).toEqual({
      title: 'Inventory',
      wordmark: false,
      region: false,
      game: false,
      bell: true,
      account: false,
    });
    expect(element.querySelector('[data-testid="tab-inventory"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="rail-home"]')).toBeNull();
    // The page's own title steps back (one h1, still there for assistive technology).
    const h1 = element.querySelector('main h1');
    expect(h1?.textContent).toBe('Inventory');
    expect(h1?.classList.contains('visually-hidden')).toBe(true);
  });

  it('gives Home its two pills and the bell, and Search its title with both pills', async () => {
    await go('/');
    expect(bar()).toEqual({
      title: null,
      wordmark: false,
      region: true,
      game: true,
      bell: true,
      account: false,
    });
    await go('/search');
    expect(bar()).toEqual({
      title: 'Search',
      wordmark: false,
      region: true,
      game: true,
      bell: true,
      account: false,
    });
  });

  it('gives Profile its title, the bell and the account menu (Settings, Appearance, Admin, Sign out)', async () => {
    await go('/profile');
    expect(bar()).toEqual({
      title: 'Profile',
      wordmark: false,
      region: false,
      game: false,
      bell: true,
      account: true,
    });
  });

  it('keeps the wordmark, the pills in scope, the bell and the avatar on every other page', async () => {
    await go('/cards/c-1');
    expect(bar()).toEqual({
      title: null,
      wordmark: true,
      region: true,
      game: false,
      bell: true,
      account: true,
    });
    await go('/settings');
    expect(bar()).toEqual({
      title: null,
      wordmark: true,
      region: false,
      game: false,
      bell: true,
      account: true,
    });
  });
});
