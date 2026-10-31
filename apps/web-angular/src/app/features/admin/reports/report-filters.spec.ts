import { pageRangeLine, reportCountLine, reportListParams, reportTabOf } from './report-filters';

const ME = '00000000-0000-4000-8000-000000000001';
const THEM = '3f2a4b5c-0000-4000-8000-000000000002';

describe('Reports filters (spec 15.4)', () => {
  it('opens on Open, and All asks every status', () => {
    expect(reportTabOf(undefined)).toBe('OPEN');
    expect(reportTabOf('bogus')).toBe('OPEN');
    expect(reportTabOf('ALL')).toBe('ALL');
    expect(reportListParams({ status: 'ALL' }, ME, 20).status).toBeUndefined();
    expect(reportListParams({}, ME, 20).status).toBe('OPEN');
  });

  it('keeps the URL filters it knows: reason, mine, one collector, page', () => {
    expect(
      reportListParams(
        { status: 'UNDER_REVIEW', reason: 'SCAM', mine: '1', reportedUserId: THEM, page: '2' },
        ME,
        20,
      ),
    ).toEqual({
      status: 'UNDER_REVIEW',
      reason: 'SCAM',
      assignedTo: ME,
      reportedUserId: THEM,
      page: 2,
      size: 20,
    });
    expect(
      reportListParams({ reason: 'NOPE', reportedUserId: 'not-a-uuid', page: '-1' }, null, 20),
    ).toEqual({
      status: 'OPEN',
      reason: undefined,
      assignedTo: undefined,
      reportedUserId: undefined,
      page: 0,
      size: 20,
    });
  });

  it('says how many reports the tab holds and which page shows', () => {
    expect(reportCountLine('OPEN', 2)).toBe('2 reports waiting for a moderator');
    expect(reportCountLine('UNDER_REVIEW', 1)).toBe('1 report under review');
    expect(reportCountLine('ALL', 0)).toBe('0 reports');
    expect(pageRangeLine(0, 20, 2)).toBe('1–2 of 2 · 20 per page');
    expect(pageRangeLine(1, 20, 45)).toBe('21–40 of 45 · 20 per page');
    expect(pageRangeLine(0, 20, 0)).toBe('0 of 0 · 20 per page');
  });
});
