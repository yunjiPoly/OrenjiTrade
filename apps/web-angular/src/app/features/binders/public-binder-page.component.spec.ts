import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  CatalogService,
  CollectorsService,
  ProfileService,
  PublicBindersService,
} from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
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
      limit: 30,
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
        provideRouter([{ path: 'search', children: [] }]),
        { provide: CollectorsService, useValue: {} },
        {
          provide: PublicBindersService,
          useValue: { getPublicBinder: () => throwError(() => limitReached()) },
        },
        {
          provide: AuthService,
          useValue: {
            ready: () => Promise.resolve(),
            isAuthenticated: signal(true),
            user: signal(null),
            changes$: new Subject(),
          },
        },
        { provide: SessionService, useValue: { me: signal(null), status: signal('anonymous') } },
        { provide: CatalogService, useValue: { listGames: () => of([]) } },
        { provide: ProfileService, useValue: {} },
        { provide: ReportActionsService, useValue: {} },
      ],
    });
    fixture = TestBed.createComponent(PublicBinderPageComponent);
    fixture.componentRef.setInput('id', '00000000-0000-4000-8000-000000000301');
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('explains the daily views as spec 6.5 says and leads back to Search, never to a plan', async () => {
    await render();
    expect(element.querySelector('[data-testid="binder-limit"]')?.textContent).toContain(
      "You've opened 30 public binders today. Every collector has the same limits. More tomorrow.",
    );
    expect(element.querySelector('a[href="/premium"]')).toBeNull();
    const action = element.querySelector<HTMLAnchorElement>('a[href="/search?tab=binders"]');
    expect(action?.textContent).toContain('Back to Search');
    expect(element.textContent).not.toMatch(/plan|premium|upgrade/i);
  });
});
