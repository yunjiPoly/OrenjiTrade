import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { ReportReasonOption, ReportsService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import {
  ReportCollectorDialogComponent,
  ReportDialogData,
} from './report-collector-dialog.component';

const REASONS = [
  { code: 'SCAM', label: 'Scam or fraud', description: 'Took payment without delivering.' },
  { code: 'SPAM', label: 'Spam', description: 'Unsolicited promotion.' },
  { code: 'OTHER', label: 'Something else', description: 'Anything else.' },
] as ReportReasonOption[];

const DATA: ReportDialogData = {
  target: { id: 'u-2', displayName: 'Tess Trader', handle: 'tess' },
  context: { source: 'CONVERSATION', conversationId: 'c-9' },
};

describe('ReportCollectorDialogComponent', () => {
  let fixture: ComponentFixture<ReportCollectorDialogComponent>;
  let element: HTMLElement;
  let reportCollector: ReturnType<typeof vi.fn>;
  let listReportReasons: ReturnType<typeof vi.fn>;

  async function create(): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ReportsService, useValue: { listReportReasons, reportCollector } },
        { provide: MAT_DIALOG_DATA, useValue: DATA },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(ReportCollectorDialogComponent);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  function confirmButton(): HTMLButtonElement {
    return [...element.querySelectorAll<HTMLButtonElement>('button[type="submit"]')][0];
  }

  async function choose(code: string): Promise<void> {
    element.querySelector<HTMLInputElement>(`input[type="radio"][value="${code}"]`)?.click();
    await fixture.whenStable();
  }

  async function confirm(): Promise<void> {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  beforeEach(() => {
    listReportReasons = vi.fn(() => of(REASONS));
    reportCollector = vi.fn(() =>
      of({
        id: 'r-1',
        status: 'OPEN',
        createdAt: '2026-09-30T10:00:00Z',
        reason: 'SPAM',
        reportedUserId: 'u-2',
      }),
    );
  });

  it('asks why, lists the reasons in server order and keeps Confirm disabled until one is chosen', async () => {
    await create();
    expect(element.querySelector('h2')?.textContent).toContain('Report collector');
    expect(element.textContent).toContain('Why are you reporting this user?');
    expect(element.textContent).toContain('Tess Trader');
    const labels = [...element.querySelectorAll('mat-radio-button')].map((node) =>
      node.textContent?.trim(),
    );
    expect(labels).toEqual(['Scam or fraud', 'Spam', 'Something else']);
    expect(confirmButton().disabled).toBe(true);
    expect(confirmButton().textContent).toContain('Confirm');
    expect(element.textContent).toContain('Cancel');
    await choose('SPAM');
    expect(confirmButton().disabled).toBe(false);
  });

  it('sends the reason, trimmed details and context with an idempotency key, then confirms', async () => {
    await create();
    await choose('SPAM');
    const details = element.querySelector('textarea') as HTMLTextAreaElement;
    details.value = '  Sends the same promotion to everyone.  ';
    details.dispatchEvent(new Event('input'));
    await confirm();
    expect(reportCollector).toHaveBeenCalledTimes(1);
    const [request] = reportCollector.mock.calls[0];
    expect(request.reportCollectorRequest).toEqual({
      reportedUserId: 'u-2',
      reason: 'SPAM',
      details: 'Sends the same promotion to everyone.',
      context: { source: 'CONVERSATION', conversationId: 'c-9' },
    });
    expect(request.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(element.querySelector('h2')?.textContent).toContain('Report sent');
    expect(element.textContent).toContain('Our moderation team will review your report');
  });

  it('explains an already open report inline and blocks another attempt', async () => {
    reportCollector.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errorCode: 'REPORT_ALREADY_OPEN', status: 409, message: 'open' },
          }),
      ),
    );
    await create();
    await choose('SCAM');
    await confirm();
    expect(element.querySelector('[data-testid="report-error"]')?.textContent).toContain(
      'You already reported Tess Trader',
    );
    expect(confirmButton().disabled).toBe(true);
    expect(element.querySelector('h2')?.textContent).toContain('Report collector');
  });

  it('offers a retry when the reasons cannot load', async () => {
    listReportReasons.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    await create();
    expect(element.textContent).toContain('The reasons could not load');
    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Retry'))
      ?.click();
    await fixture.whenStable();
    expect(element.querySelectorAll('mat-radio-button')).toHaveLength(3);
  });
});
