import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AdminReportsService } from '@orenji/api-client';
import { of } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { AdminCounts } from '../console/admin-counts.service';
import { AdminReportsPageComponent } from './admin-reports-page.component';

@Component({ template: 'panel' })
class Panel {}

const report = (id: string, number: number) => ({
  id,
  number,
  status: 'OPEN',
  reason: 'SPAM',
  contextSource: 'PROFILE',
  reporter: { id: 'r', handle: 'rita', displayName: 'Rita' },
  reportedUser: { id: `u-${id}`, handle: `h${number}`, displayName: `H ${number}` },
  assignee: null,
  createdAt: '2026-10-30T12:00:00Z',
  openReportsAgainstUser: 1,
});

describe('AdminReportsPageComponent (spec 15.4, A2)', () => {
  it('marks the open report in the list and follows another row (same panel, new id)', async () => {
    const listReports = vi.fn(() =>
      of({ items: [report('a', 1001), report('b', 1002)], page: 0, size: 20, totalItems: 2 }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'admin/reports',
            component: AdminReportsPageComponent,
            children: [
              { path: '', pathMatch: 'full', children: [] },
              { path: ':id', component: Panel },
            ],
          },
        ]),
        { provide: AdminReportsService, useValue: { listReports } },
        { provide: SessionService, useValue: { me: signal({ id: 'me' }) } },
        { provide: AdminCounts, useValue: { counts: signal(null), refresh: vi.fn() } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/reports/a');
    const element = harness.routeNativeElement as HTMLElement;
    harness.detectChanges();
    const current = () =>
      [...element.querySelectorAll('[aria-current="true"]')].map((row) =>
        row.getAttribute('data-report'),
      );
    expect(element.querySelector('h1')?.textContent).toContain('Reports');
    expect(current()).toEqual(['a']);
    await harness.navigateByUrl('/admin/reports/b');
    harness.detectChanges();
    expect(current()).toEqual(['b']);
    await harness.navigateByUrl('/admin/reports');
    harness.detectChanges();
    expect(current()).toEqual([]);
    expect(element.textContent).toContain('2 reports waiting for a moderator');
  });
});
