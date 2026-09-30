import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Ad, AdsService } from '@orenji/api-client';
import { of } from 'rxjs';
import { AuthService, AuthState } from '../../core/auth/auth.service';
import { SessionService, SessionStatus } from '../../core/auth/session.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { adClickHref, adImageSrc } from './ad-links';
import { SponsoredSlotComponent } from './sponsored-slot.component';

const API = 'http://localhost:8080';

function ad(id: string, overrides: Partial<Ad> = {}): Ad {
  return {
    creativeId: id,
    placement: 'MAP_PANEL',
    sponsored: true,
    label: 'Sponsored',
    advertiser: 'Maple Sleeve Co.',
    headline: `Headline ${id}`,
    body: 'Fictional sleeves.',
    ctaLabel: 'See sleeves',
    clickUrl: `/api/v1/ads/${id}/click?token=v1.abc`,
    impressionToken: `token-${id}`,
    ...overrides,
  } as Ad;
}

describe('ad links', () => {
  it('only follows the API click route or https URLs', () => {
    expect(adClickHref('/api/v1/ads/c-1/click?token=v1.a-b_c', API)).toBe(
      'http://localhost:8080/api/v1/ads/c-1/click?token=v1.a-b_c',
    );
    expect(adClickHref('https://maplesleeve.example/sleeves', API)).toBe(
      'https://maplesleeve.example/sleeves',
    );
    expect(adClickHref('javascript:alert(1)', API)).toBeNull();
    expect(adClickHref('/admin', API)).toBeNull();
    expect(adClickHref('//evil.example/x', API)).toBeNull();
    expect(adImageSrc('http://insecure.example/x.png', API)).toBeNull();
    expect(adImageSrc('/api/v1/public/placeholder-images/x.svg', API)).toBe(
      'http://localhost:8080/api/v1/public/placeholder-images/x.svg',
    );
  });
});

describe('SponsoredSlotComponent', () => {
  let fixture: ComponentFixture<SponsoredSlotComponent>;
  let element: HTMLElement;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  const authState = signal<AuthState>('anonymous');
  const sessionStatus = signal<SessionStatus>('anonymous');
  const me = signal<{ plan: string } | null>(null);
  const flagValues = signal<Record<string, boolean>>({});
  const flags = {
    enabled: (key: string) => computed(() => flagValues()[key] === true),
  };

  async function create(ads: Ad[], advertising = true): Promise<void> {
    api['listAds'].mockReturnValue(of(ads));
    flagValues.set({ advertising, premiumPlans: true });
    fixture = TestBed.createComponent(SponsoredSlotComponent);
    fixture.componentRef.setInput('placement', 'MAP_PANEL');
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  beforeEach(() => {
    authState.set('anonymous');
    sessionStatus.set('anonymous');
    me.set(null);
    api = {
      listAds: vi.fn(() => of([])),
      recordAdImpression: vi.fn(() => of({})),
    };
    TestBed.configureTestingModule({
      imports: [SponsoredSlotComponent],
      providers: [
        provideRouter([]),
        { provide: AdsService, useValue: api },
        {
          provide: AuthService,
          useValue: { authState, user: signal(null), isAuthenticated: signal(false) },
        },
        { provide: SessionService, useValue: { status: sessionStatus, me } },
        { provide: FeatureFlagsService, useValue: flags },
        { provide: AppConfigService, useValue: { apiBaseUrl: signal(API) } },
      ],
    });
  });

  it('labels every ad "Sponsored", links through the click route and records impressions once', async () => {
    await create([ad('c-1', { label: 'Promoted' })]);
    expect(api['listAds']).toHaveBeenCalledWith(
      { placement: 'MAP_PANEL' },
      'body',
      false,
      expect.anything(),
    );
    const card = element.querySelector('[data-testid="sponsored-ad"]');
    expect(card?.querySelector('[data-testid="sponsored-label"]')?.textContent?.trim()).toBe(
      'Sponsored',
    );
    expect(card?.textContent).toContain('Headline c-1');
    const link = card?.querySelector<HTMLAnchorElement>('a.ad__link');
    expect(link?.getAttribute('href')).toBe(`${API}/api/v1/ads/c-1/click?token=v1.abc`);
    expect(link?.getAttribute('rel')).toContain('sponsored');
    // jsdom has no IntersectionObserver: the directive reports the ad as seen after rendering.
    await fixture.whenStable();
    expect(api['recordAdImpression']).toHaveBeenCalledTimes(1);
    expect(api['recordAdImpression']).toHaveBeenCalledWith(
      { creativeId: 'c-1', adImpressionRequest: { token: 'token-c-1' } },
      'body',
      false,
      expect.anything(),
    );
  });

  it('renders nothing for [] (members without ads) and never asks while advertising is off', async () => {
    await create([]);
    expect(element.querySelector('[data-testid="sponsored-ad"]')).toBeNull();
    expect(element.textContent?.trim()).toBe('');

    api['listAds'].mockClear();
    await create([ad('c-2')], false);
    expect(api['listAds']).not.toHaveBeenCalled();
    expect(element.querySelector('[data-testid="sponsored-ad"]')).toBeNull();
  });

  it('drops ads with unsafe links and waits for a signed-in session before asking', async () => {
    authState.set('authenticated');
    sessionStatus.set('loading');
    await create([ad('c-3', { clickUrl: 'javascript:alert(1)' })]);
    expect(api['listAds']).not.toHaveBeenCalled();

    sessionStatus.set('ready');
    me.set({ plan: 'FREE' });
    await fixture.whenStable();
    expect(api['listAds']).toHaveBeenCalledTimes(1);
    expect(element.querySelector('[data-testid="sponsored-ad"]')).toBeNull();

    // An upgrade changes the plan: the placement asks again (and gets [] for Premium).
    api['listAds'].mockReturnValue(of([]));
    me.set({ plan: 'PREMIUM' });
    await fixture.whenStable();
    expect(api['listAds']).toHaveBeenCalledTimes(2);
  });
});
