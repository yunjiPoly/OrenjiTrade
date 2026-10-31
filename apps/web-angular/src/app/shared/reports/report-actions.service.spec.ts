import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { ReportActionsService } from './report-actions.service';

describe('ReportActionsService', () => {
  let open: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    open = vi.fn(() => ({ afterClosed: () => of(undefined) }));
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: { open } }] });
  });

  it("a post's report uses the window's height, never more; a collector's keeps Material's (WF review R1-4)", async () => {
    const reports = TestBed.inject(ReportActionsService);
    const target = { id: 'u-3', displayName: 'Lucas', handle: 'lucas_tcg' };
    await reports.report(
      target,
      { source: 'POST', postId: 'p-7' },
      { meta: 'Ontario', text: 'Hi' },
    );
    expect(open.mock.calls[0][1]).toEqual(
      expect.objectContaining({ panelClass: 'app-dialog--form', maxHeight: 'calc(100dvh - 32px)' }),
    );
    await reports.report(target, { source: 'PROFILE' });
    expect(open.mock.calls[1][1]).not.toHaveProperty('maxHeight');
  });
});
