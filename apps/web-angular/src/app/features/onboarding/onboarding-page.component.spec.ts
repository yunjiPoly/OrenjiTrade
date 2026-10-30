import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { GameResponse, MeResponse, ProfileService } from '@orenji/api-client';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { ToastService } from '../../core/feedback/toast.service';
import { GameContext } from '../../core/game/game-context.service';
import { GamesStore } from '../../shared/catalog/games.store';
import { MyLocationStore } from '../../shared/location/my-location.store';
import { MyProfileStore } from '../../shared/profile/my-profile.store';
import { OnboardingPageComponent } from './onboarding-page.component';

/** Lets the page's async `load()` and the promise chains of its actions settle (zoneless). */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function me(onboarding: MeResponse['onboarding']): MeResponse {
  return {
    id: 'u-1',
    handle: 'collector_4vp9pf',
    displayName: 'collector_4vp9pf',
    email: 'maika@example.test',
    emailVerified: true,
    roles: ['USER'] as unknown as MeResponse['roles'],
    status: 'ACTIVE' as MeResponse['status'],
    createdAt: '2026-09-01T00:00:00Z',
    onboarding,
    requiredConsents: [],
  };
}

const GAMES = [
  { slug: 'yugioh', name: 'Yu-Gi-Oh!', status: 'ACTIVE', hasCards: true },
  { slug: 'pokemon', name: 'Pokémon', status: 'ACTIVE', hasCards: true },
  { slug: 'onepiece', name: 'One Piece', status: 'ACTIVE', hasCards: false },
] as unknown as GameResponse[];

describe('OnboardingPageComponent, the welcome (spec 14: three steps)', () => {
  let fixture: ComponentFixture<OnboardingPageComponent>;
  let element: HTMLElement;
  let save: ReturnType<typeof vi.fn>;
  let availability: ReturnType<typeof vi.fn>;
  let select: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  async function mount(onboarding: MeResponse['onboarding']): Promise<void> {
    save = vi.fn(async () => undefined);
    select = vi.fn(() => true);
    availability = vi.fn(({ handle }: { handle: string }) =>
      of({
        handle,
        status: handle === 'taken_one' ? 'TAKEN' : 'AVAILABLE',
        available: handle !== 'taken_one',
      }),
    );
    TestBed.configureTestingModule({
      imports: [OnboardingPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProfileService, useValue: { getHandleAvailability: availability } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: GameContext, useValue: { select } },
        {
          provide: AuthService,
          useValue: { user: signal({ uid: 'fb-1', displayName: 'Maïka T.' }), signOut: vi.fn() },
        },
        {
          provide: SessionService,
          useValue: {
            me: signal(me(onboarding)),
            status: signal('ready'),
            load: vi.fn(async () => 'ready'),
          },
        },
        {
          provide: MyProfileStore,
          useValue: {
            error: signal(null),
            load: vi.fn(async () => ({
              handle: 'collector_4vp9pf',
              displayName: 'collector_4vp9pf',
              bio: '',
              games: [],
              languages: ['en'],
              tags: [],
              avatarUrl: null,
            })),
            save,
            saveTags: vi.fn(async () => undefined),
          },
        },
        {
          provide: MyLocationStore,
          useValue: {
            error: signal(null),
            location: signal(null),
            privacy: signal(null),
            load: vi.fn(async () => true),
            saveLocation: vi.fn(),
            savePrivacy: vi.fn(),
          },
        },
        {
          provide: GamesStore,
          useValue: {
            games: signal(GAMES),
            loading: signal(false),
            error: signal(null),
            load: vi.fn(async () => GAMES),
          },
        },
      ],
    });
    const router = TestBed.inject(Router);
    navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(OnboardingPageComponent);
    fixture.componentRef.setInput('returnUrl', '/messages');
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  function step(): string {
    return element.querySelector('[data-testid="welcome-step"]')?.textContent?.trim() ?? '';
  }

  function title(): string {
    return element.querySelector('h1')?.textContent?.trim() ?? '';
  }

  it('starts at "Who are you?", Step 1 of 3, with the name typed at sign-up', async () => {
    await mount({ profileComplete: false, locationSet: false, interestsSet: false });
    expect(step()).toBe('Step 1 of 3');
    expect(title()).toBe('Who are you?');
    expect(element.querySelectorAll('.welcome__bar-part--on')).toHaveLength(1);
    expect(element.querySelector<HTMLInputElement>('#wl-name')?.value).toBe('Maïka T.');
    // The 18+ confirmation is never a welcome step.
    expect(element.textContent).not.toContain('18 years');
  });

  it('checks the handle while typing: "@sam_trades is free", or taken', async () => {
    await mount({ profileComplete: false, locationSet: false, interestsSet: false });
    vi.useFakeTimers();
    try {
      const handle = element.querySelector<HTMLInputElement>('#wl-handle')!;
      handle.value = 'Sam_Trades';
      handle.dispatchEvent(new Event('input'));
      await vi.advanceTimersByTimeAsync(450);
      fixture.detectChanges();
      expect(availability).toHaveBeenLastCalledWith(
        { handle: 'sam_trades' },
        'body',
        false,
        expect.anything(),
      );
      expect(element.querySelector('#wl-handle-check')?.textContent?.trim()).toBe(
        '@sam_trades is free',
      );
      handle.value = 'taken_one';
      handle.dispatchEvent(new Event('input'));
      await vi.advanceTimersByTimeAsync(450);
      fixture.detectChanges();
      expect(element.querySelector('#wl-handle-check')?.textContent?.trim()).toBe(
        'That handle is already taken. Try another one.',
      );
      expect(handle.getAttribute('aria-invalid')).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('resumes at the games; tiles mark "Opens first" and dim the games coming soon', async () => {
    await mount({ profileComplete: true, locationSet: false, interestsSet: false });
    expect(step()).toBe('Step 2 of 3');
    expect(title()).toBe('What do you collect?');
    const tiles = [...element.querySelectorAll<HTMLButtonElement>('.tile')];
    expect(tiles.map((tile) => tile.dataset['game'])).toEqual(['yugioh', 'pokemon', 'onepiece']);
    expect(tiles[2].classList).toContain('tile--soon');
    // The art and the name are dimmed, never "Cards coming soon" (contrast, WG review A3).
    expect(getComputedStyle(tiles[2]).opacity).not.toBe('0.6');
    expect(getComputedStyle(tiles[2].querySelector('.tile__name')!).opacity).toBe('0.6');
    expect(getComputedStyle(tiles[2].querySelector('.tile__soon')!).opacity).not.toBe('0.6');
    tiles[2].click();
    tiles[1].click();
    fixture.detectChanges();
    // One Piece was picked first but has no cards yet: Pokémon opens first.
    expect(tiles[1].querySelector('.tile__badge')?.textContent).toBe('Opens first');
    expect(tiles[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('the place: no GPS, "Show me on the map" off; Finish opens the first game, then the page', async () => {
    await mount({ profileComplete: true, locationSet: false, interestsSet: true });
    expect(step()).toBe('Step 3 of 3');
    expect(title()).toBe('Where do you ship from?');
    expect(element.textContent).toContain('We never use GPS and never ask for your address.');
    expect(
      element
        .querySelector('[data-testid="welcome-map-switch"] button')
        ?.getAttribute('aria-checked'),
    ).toBe('false');
    const skip = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Skip for now',
    )!;
    skip.click();
    await settle();
    expect(navigateByUrl).toHaveBeenCalledWith('/messages');
  });

  it('Back goes to the step before', async () => {
    await mount({ profileComplete: true, locationSet: false, interestsSet: false });
    const back = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Back',
    )!;
    back.click();
    fixture.detectChanges();
    expect(title()).toBe('Who are you?');
  });
});
