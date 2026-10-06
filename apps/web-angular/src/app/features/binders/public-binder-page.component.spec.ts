import { HttpErrorResponse } from '@angular/common/http';
import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PublicBindersService } from '@orenji/api-client';
import { throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { ReportActionsService } from '../../shared/reports/report-actions.service';
import { PublicBinderPageComponent } from './public-binder-page.component';

/** The API's answer once the plan's daily binder views are used up. */
function limitReached(): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 429,
    error: {
      type: 'about:blank',
      title: 'Limit reached',
      status: 429,
      errorCode: 'LIMIT_REACHED',
      message: 'You have reached the limit of your plan for this action',
      requestId: 'req-limit',
      timestamp: '2026-10-05T12:00:00Z',
      limitKey: 'binder.views.per_day',
      planCode: 'FREE',
      upgradeUrl: '/premium',
    },
  });
}

describe('PublicBinderPageComponent (daily views limit)', () => {
  let fixture: ComponentFixture<PublicBinderPageComponent>;
  let element: HTMLElement;
  const flagValues = signal<Record<string, boolean>>({});
  const flags = {
    enabled: (key: string) => computed(() => flagValues()[key] === true),
  };

  async function render(premiumPlans: boolean): Promise<void> {
    flagValues.set({ premiumPlans });
    TestBed.configureTestingModule({
      imports: [PublicBinderPageComponent],
      providers: [
        provideRouter([
          { path: 'premium', children: [] },
          { path: 'map', children: [] },
        ]),
        {
          provide: PublicBindersService,
          useValue: { getPublicBinder: () => throwError(() => limitReached()) },
        },
        {
          provide: AuthService,
          useValue: { ready: () => Promise.resolve(), isAuthenticated: signal(true) },
        },
        { provide: SessionService, useValue: { me: signal(null) } },
        { provide: ReportActionsService, useValue: {} },
        { provide: FeatureFlagsService, useValue: flags },
      ],
    });
    fixture = TestBed.createComponent(PublicBinderPageComponent);
    fixture.componentRef.setInput('id', '00000000-0000-4000-8000-000000000301');
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('offers the plans when the limit is hit and Premium is on', async () => {
    await render(true);
    expect(element.textContent).toContain("You reached today's binder views");
    const action = element.querySelector<HTMLAnchorElement>('a[href="/premium"]');
    expect(action?.textContent).toContain('See plans');
  });

  it('leads back to the map, never to the plans, while the premiumPlans flag is off', async () => {
    await render(false);
    expect(element.textContent).toContain("You reached today's binder views");
    expect(element.querySelector('a[href="/premium"]')).toBeNull();
    const action = element.querySelector<HTMLAnchorElement>('a[href="/map"]');
    expect(action?.textContent).toContain('Back to the map');
    expect(element.textContent).not.toContain('plans');
  });
});
