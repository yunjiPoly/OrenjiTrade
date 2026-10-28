import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { SessionService, SessionStatus } from '../../auth/session.service';
import { ApiError } from '../../http/api-error';
import { SessionBannerComponent } from './session-banner.component';

describe('SessionBannerComponent (spec 4.1)', () => {
  let fixture: ComponentFixture<SessionBannerComponent>;
  let element: HTMLElement;
  const status = signal<SessionStatus>('error');
  const error = signal<ApiError | null>(null);
  let load: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    status.set('error');
    error.set(
      new ApiError({
        status: 503,
        errorCode: 'UNAVAILABLE',
        message: 'Down',
        requestId: null,
        fieldErrors: {},
      }),
    );
    load = vi.fn(async () => 'error');
    await TestBed.configureTestingModule({
      imports: [SessionBannerComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { signOut: vi.fn() } },
        { provide: SessionService, useValue: { status, error, refreshing: signal(false), load } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SessionBannerComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('says the account could not load, with "Try again"', () => {
    const banner = element.querySelector('[data-testid="session-banner"]');
    expect(banner?.getAttribute('role')).toBe('alert');
    expect(banner?.textContent).toContain('We could not load your account.');
    const buttons = Array.from(element.querySelectorAll('button'), (b) => b.textContent?.trim());
    expect(buttons).toEqual(['Try again']);
  });

  it('retries and brings the focus back to the strip', async () => {
    element.querySelector<HTMLButtonElement>('button')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    expect(load).toHaveBeenCalled();
    expect(document.activeElement).toBe(element.querySelector('[data-testid="session-banner"]'));
  });

  it('brings the focus back to the strip when the retry fails again (the strip is drawn anew)', async () => {
    load.mockImplementation(async () => {
      status.set('loading');
      await new Promise((resolve) => setTimeout(resolve, 20));
      status.set('error');
      return 'error';
    });
    element.querySelector<HTMLButtonElement>('button')!.click();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="session-banner"]')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 40));
    await fixture.whenStable();
    expect(document.activeElement).toBe(element.querySelector('[data-testid="session-banner"]'));
  });

  it('offers Sign out when the API no longer accepts the session, and hides when loaded', async () => {
    error.set(
      new ApiError({
        status: 401,
        errorCode: 'UNAUTHENTICATED',
        message: 'No',
        requestId: null,
        fieldErrors: {},
      }),
    );
    await fixture.whenStable();
    expect(Array.from(element.querySelectorAll('button'), (b) => b.textContent?.trim())).toEqual([
      'Try again',
      'Sign out',
    ]);
    status.set('ready');
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="session-banner"]')).toBeNull();
  });
});
