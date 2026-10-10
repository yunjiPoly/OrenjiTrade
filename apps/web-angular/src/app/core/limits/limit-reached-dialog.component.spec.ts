import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { Plan } from '@orenji/api-client';
import { provideApiClient } from '../api/provide-api-client';
import { AppConfigService } from '../config/app-config.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { apiBaseUrlInterceptor } from '../http/api-base-url.interceptor';
import { LimitReachedInfo } from './limit-reached';
import { LimitReachedDialogComponent } from './limit-reached-dialog.component';

const API = 'http://api.test';

const PLANS: Plan[] = [
  {
    code: 'FREE',
    name: 'Free',
    limits: [
      {
        key: 'binder.views.per_day',
        window: 'DAY' as never,
        limit: 30,
        description: 'Public binder views per day',
      },
      {
        key: 'wishlist.items.max',
        window: 'TOTAL' as never,
        limit: 20,
        description: 'Wishlist items',
      },
    ],
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    limits: [
      {
        key: 'binder.views.per_day',
        window: 'DAY' as never,
        description: 'Public binder views per day',
      },
      {
        key: 'wishlist.items.max',
        window: 'TOTAL' as never,
        limit: 500,
        description: 'Wishlist items',
      },
    ],
  },
];

function info(overrides: Partial<LimitReachedInfo> = {}): LimitReachedInfo {
  return {
    limitKey: 'binder.views.per_day',
    limit: 30,
    used: 30,
    resetsAt: '2099-01-01T00:00:00Z',
    planCode: 'FREE',
    upgradeUrl: '/premium',
    requestId: 'req-1',
    ...overrides,
  };
}

describe('LimitReachedDialogComponent', () => {
  let fixture: ComponentFixture<LimitReachedDialogComponent>;
  let backend: HttpTestingController;

  async function render(data: LimitReachedInfo, premiumPlans = true): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [LimitReachedDialogComponent],
      providers: [
        provideRouter([{ path: 'premium', children: [] }]),
        provideHttpClient(withInterceptors([apiBaseUrlInterceptor])),
        provideHttpClientTesting(),
        provideApiClient(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    TestBed.inject(AppConfigService).set({ apiBaseUrl: API });
    TestBed.inject(FeatureFlagsService).set({ premiumPlans });
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LimitReachedDialogComponent);
    fixture.detectChanges();
    backend.expectOne(`${API}/api/v1/plans`).flush(PLANS);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => backend.verify());

  it('explains the limit, the usage, the reset and the premium benefit', async () => {
    const element = await render(info());
    const text = element.textContent ?? '';
    expect(element.querySelector('[data-testid="limit-summary"]')?.textContent).toContain(
      'Public binder views per day',
    );
    expect(text).toContain('you used 30 of 30 today');
    // Collectors read the limit's name, never its technical key.
    expect(text).not.toContain('binder.views.per_day');
    expect(element.querySelector('[data-testid="limit-reset"]')?.textContent).toMatch(/in \d+/);
    expect(text).toContain('Premium removes this limit');
    const link = element.querySelector<HTMLAnchorElement>('a[href="/premium"]');
    expect(link?.textContent).toContain('See Premium');

    // Following it closes every dialog (the form that hit the limit too).
    const closeAll = vi.spyOn(MatDialog.prototype, 'closeAll');
    link?.click();
    expect(closeAll).toHaveBeenCalled();
    closeAll.mockRestore();
  });

  it('names the premium value for capped limits and explains totals that never reset', async () => {
    const element = await render(
      info({ limitKey: 'wishlist.items.max', limit: 20, used: 20, resetsAt: null }),
    );
    const text = element.textContent ?? '';
    expect(text).toContain('Premium raises it to 500');
    expect(text).toContain('Does not reset on its own');
  });

  it('hides the premium link while the premiumPlans flag is off', async () => {
    const element = await render(info(), false);
    expect(element.querySelector('a[href="/premium"]')).toBeNull();
    expect(element.textContent).toContain('Premium plans are not available yet');
  });
});
