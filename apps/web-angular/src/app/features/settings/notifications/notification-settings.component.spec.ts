import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationSettingsResponse, SettingsService } from '@orenji/api-client';
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

  beforeEach(async () => {
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
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationSettingsComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('turns wishlist alerts off with one switch (no per-channel row for them)', async () => {
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

    toggle!.click();
    await fixture.whenStable();
    expect(element.textContent).toContain('Off: no wishlist alerts.');
    const save = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('Save preferences'),
    );
    save!.click();
    await fixture.whenStable();
    expect(api.updateNotificationSettings).toHaveBeenCalledWith(
      { notificationSettingsRequest: expect.objectContaining({ wishlistAlerts: false }) },
      'body',
      false,
      expect.anything(),
    );
  });
});
