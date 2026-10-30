import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { ToastService } from '../../core/feedback/toast.service';
import { ThemeService } from '../../core/theme/theme.service';
import { MyLocationStore } from '../../shared/location/my-location.store';
import { SettingsShellComponent } from './settings-shell.component';

describe('SettingsShellComponent (spec 13, board W25)', () => {
  let fixture: ComponentFixture<SettingsShellComponent>;
  let element: HTMLElement;
  let signOut: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    signOut = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      imports: [SettingsShellComponent],
      providers: [
        provideRouter([]),
        {
          provide: SessionService,
          useValue: {
            me: signal({ avatarUrl: null }),
            displayName: signal('Sam Tremblay'),
            handle: signal('sam_trades'),
          },
        },
        {
          provide: AuthService,
          useValue: { user: signal({ email: 'sam@example.test' }), signOut },
        },
        { provide: FeatureFlagsService, useValue: { enabled: () => signal(true) } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: ThemeService, useValue: { preference: signal('system') } },
        {
          provide: MyLocationStore,
          useValue: {
            location: signal({ discoverable: true, location: { label: 'Quebec, Canada' } }),
            loading: signal(false),
            load: vi.fn(),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(SettingsShellComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  it('groups the sections, without Offers or Payouts, with the lines under them', () => {
    expect(element.querySelector('.st__who')?.textContent).toBe('Signed in as sam@example.test');
    const groups = [...element.querySelectorAll('.st__group')].map((g) => g.textContent?.trim());
    expect(groups).toEqual(['Where you ship from', 'App', 'Safety', 'Account']);
    const links = [...element.querySelectorAll('.st__link')].map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      '/location',
      '/shipping',
      '/notifications',
      '/privacy',
      '/appearance',
      '/blocked',
      '/reports',
      '/account',
      '/legal',
    ]);
    expect(element.textContent).not.toMatch(/Offers|Payouts/);
    expect(element.textContent).toContain('Quebec, Canada · On the map');
    expect(element.textContent).toContain('Phone app only');
    expect(element.textContent).toContain('Same as the system');
    expect(element.querySelector('.st__me')?.getAttribute('aria-label')).toBe('Edit profile');
    expect(element.textContent).toContain('OrenjiTrade web 1.0.0');
  });

  it('signs out and goes Home', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    element.querySelector<HTMLButtonElement>('.st__signout')!.click();
    await fixture.whenStable();
    expect(signOut).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
