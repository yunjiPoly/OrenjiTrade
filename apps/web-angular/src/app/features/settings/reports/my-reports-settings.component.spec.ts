import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MyReport, ReportsService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { MyReportsSettingsComponent } from './my-reports-settings.component';

const REPORTS = [
  {
    id: 'r-1',
    status: 'DISMISSED',
    reason: 'SPAM',
    createdAt: '2026-09-20T10:00:00Z',
    resolvedAt: '2026-09-21T10:00:00Z',
    reportedUser: { id: 'u-1', handle: 'spammy', displayName: 'Sam Spam' },
  },
  {
    id: 'r-2',
    status: 'OPEN',
    reason: 'SCAM',
    createdAt: '2026-09-29T10:00:00Z',
    reportedUser: { id: 'u-2', handle: 'shady', displayName: 'Shady Seller' },
  },
] as unknown as MyReport[];

describe('MyReportsSettingsComponent', () => {
  let fixture: ComponentFixture<MyReportsSettingsComponent>;
  let element: HTMLElement;
  let listMyReports: ReturnType<typeof vi.fn>;

  async function create(): Promise<void> {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ReportsService, useValue: { listMyReports } }],
    });
    fixture = TestBed.createComponent(MyReportsSettingsComponent);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    listMyReports = vi.fn(() => of(REPORTS));
  });

  it('lists the reports newest first with where each review stands', async () => {
    await create();
    const rows = [...element.querySelectorAll('li.report')];
    expect(rows.map((row) => row.getAttribute('data-report'))).toEqual(['r-2', 'r-1']);
    expect(rows[0].textContent).toContain('Shady Seller');
    expect(rows[0].textContent).toContain('Scam or fraud');
    expect(rows[0].textContent).toContain('Waiting for a moderator');
    expect(rows[1].textContent).toContain('Reviewed — no violation found');
    expect(element.textContent).toContain('1 waiting for a decision · 1 reviewed');
  });

  it('shows the empty and error states', async () => {
    listMyReports.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    await create();
    expect(element.textContent).toContain('Your reports could not load');
    listMyReports.mockReturnValueOnce(of([]));
    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Retry'))
      ?.click();
    await fixture.whenStable();
    expect(element.textContent).toContain('You have not reported anyone');
  });
});
