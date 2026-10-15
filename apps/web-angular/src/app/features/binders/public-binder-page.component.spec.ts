import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PublicBindersService } from '@orenji/api-client';
import { throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { ReportActionsService } from '../../shared/reports/report-actions.service';
import { PublicBinderPageComponent } from './public-binder-page.component';

/** The API's answer once the daily binder views are used up (an old server may still send a plan). */
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
  async function render(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [PublicBinderPageComponent],
      providers: [
        provideRouter([{ path: 'map', children: [] }]),
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
      ],
    });
    fixture = TestBed.createComponent(PublicBinderPageComponent);
    fixture.componentRef.setInput('id', '00000000-0000-4000-8000-000000000301');
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('explains the daily views plainly and leads back to the map, never to a plan', async () => {
    await render();
    expect(element.textContent).toContain("You reached today's binder views");
    expect(element.textContent).toContain(
      'Every collector can open a set number of public binders',
    );
    expect(element.querySelector('a[href="/premium"]')).toBeNull();
    const action = element.querySelector<HTMLAnchorElement>('a[href="/map"]');
    expect(action?.textContent).toContain('Back to the map');
    expect(element.textContent).not.toMatch(/plan|premium/i);
  });
});
