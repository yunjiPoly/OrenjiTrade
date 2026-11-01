import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import {
  LocationService,
  MyLocationResponse,
  NotificationSettingsResponse,
  SettingsService,
} from '@orenji/api-client';
import { of } from 'rxjs';
import { NotificationSettingsComponent } from './notification-settings.component';

function settings(wishlistAlerts: boolean): NotificationSettingsResponse {
  const channels = { push: true, email: false, inApp: true };
  return {
    pushEnabled: true,
    emailEnabled: false,
    inAppEnabled: true,
    wishlistAlerts,
    categories: {
      MESSAGE: channels,
      OFFER: channels,
      RATING: channels,
      TRADE: channels,
      BINDER_FRESHNESS: channels,
      REPORT_DECISION: channels,
      MARKETING: { push: false, email: false, inApp: false },
    },
    quietHours: { enabled: false, start: '22:00', end: '08:00', timezone: 'America/Toronto' },
  } as NotificationSettingsResponse;
}

describe('NotificationSettingsComponent', () => {
  let fixture: ComponentFixture<NotificationSettingsComponent>;
  let element: HTMLElement;
  let api: {
    getNotificationSettings: ReturnType<typeof vi.fn>;
    updateNotificationSettings: ReturnType<typeof vi.fn>;
  };
  let myLocation: MyLocationResponse;

  beforeEach(async () => {
    myLocation = {
      location: { countryCode: 'CA', subdivisionCode: 'CA-QC' },
      discoverable: false,
    } as MyLocationResponse;
    api = {
      getNotificationSettings: vi.fn(() => of(settings(true))),
      updateNotificationSettings: vi.fn(({ notificationSettingsRequest }) =>
        of(notificationSettingsRequest),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [NotificationSettingsComponent],
      providers: [
        { provide: SettingsService, useValue: api },
        { provide: LocationService, useValue: { getMyLocation: vi.fn(() => of(myLocation)) } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        provideRouter([]),
      ],
    }).compileComponents();
  });

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(NotificationSettingsComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  it('lists the web topics by App and Email; push is set on the phone; no offers or trades (spec 13)', async () => {
    await create();
    fixture.detectChanges();
    const heads = [...element.querySelectorAll('.notif__table thead th')].map((th) =>
      th.textContent?.trim(),
    );
    expect(heads).toEqual(['Topic', 'App', 'Email']);
    const topics = [...element.querySelectorAll('.notif__table tbody th .section-row__label')].map(
      (th) => th.textContent?.trim(),
    );
    expect(topics).not.toContain('Offers');
    expect(topics).not.toContain('Trades');
    expect(topics).toContain('Messages');
    expect(element.querySelector('[data-testid="notif-push-phone"]')?.textContent).toBe(
      'Set on your phone',
    );
    // Board W25: why there is nothing to set here.
    expect(element.querySelector('[data-testid="notif-push-web"]')?.textContent).toBe(
      'The website sends no push notifications.',
    );
  });

  it('turns wishlist alerts off with one switch (no per-channel row for them)', async () => {
    await create();
    const toggle = element.querySelector<HTMLButtonElement>(
      '[data-testid="notif-wishlist-alerts"] button[role="switch"]',
    );
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
    expect(element.textContent).toContain('Wishlist alerts');
    expect(element.textContent).not.toContain('Wishlist matches');
    const rows = Array.from(element.querySelectorAll('.notif__table tbody th'), (cell) =>
      cell.textContent?.trim(),
    );
    expect(rows.some((row) => row?.toLowerCase().includes('wishlist'))).toBe(false);

    // The help line describes the switch; it never announces a state that is not saved yet.
    expect(element.textContent).toContain('One alert per new listing that fits a wish.');
    expect(element.querySelector('[data-testid="notif-wishlist-no-location"]')).toBeNull();
    toggle!.click();
    await fixture.whenStable();
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    expect(element.textContent).toContain('One alert per new listing that fits a wish.');
    expect(element.textContent).toContain('You have unsaved changes');
    const save = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('Save preferences'),
    );
    save!.focus();
    save!.click();
    await fixture.whenStable();
    expect(api.updateNotificationSettings).toHaveBeenCalledWith(
      { notificationSettingsRequest: expect.objectContaining({ wishlistAlerts: false }) },
      'body',
      false,
      expect.anything(),
    );
    // Saved: nothing left to save, aria-disabled (never disabled), so the focus stays (A4).
    fixture.detectChanges();
    expect(save!.getAttribute('aria-disabled')).toBe('true');
    expect(save!.disabled).toBe(false);
    expect(document.activeElement).toBe(save);
  });

  it('says next to the switch that wishlist alerts need a country and state', async () => {
    myLocation = { discoverable: false } as MyLocationResponse;
    await create();
    const hint = element.querySelector('[data-testid="notif-wishlist-no-location"]');
    expect(hint?.textContent).toContain('set your country and state to get them');
    expect(hint?.querySelector('a')?.getAttribute('href')).toBe('/settings/location');
  });
});
