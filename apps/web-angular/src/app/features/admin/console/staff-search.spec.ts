import {
  fromStaffSearch,
  staffEmptyLine,
  orderedResults,
  parseStaffQuery,
  reportNumberLabel,
  staffQueryReady,
  staffSearchFailed,
} from './staff-search';

describe('the staff search (spec 15.1)', () => {
  it('reads a report number with or without #', () => {
    expect(parseStaffQuery(' #1047 ')).toEqual({ text: '#1047', number: 1047 });
    expect(parseStaffQuery('1047').number).toBe(1047);
    expect(parseStaffQuery('#0').number).toBeNull();
    expect(parseStaffQuery('maya').number).toBeNull();
  });

  it('asks admins for texts of 2 characters, moderators for numbers only', () => {
    expect(staffQueryReady(parseStaffQuery('ma'), true)).toBe(true);
    expect(staffQueryReady(parseStaffQuery('m'), true)).toBe(false);
    expect(staffQueryReady(parseStaffQuery('maya'), false)).toBe(false);
    expect(staffQueryReady(parseStaffQuery('#1047'), false)).toBe(true);
  });

  it('lists Collectors, Cards then Reports, and reads numbers as #1047', () => {
    const results = orderedResults([
      { id: 'r', group: 'reports', title: '', line: '', link: [] },
      { id: 'c', group: 'cards', title: '', line: '', link: [] },
      { id: 'u', group: 'collectors', title: '', line: '', link: [] },
    ]);
    expect(results.map((result) => result.id)).toEqual(['u', 'c', 'r']);
    expect(reportNumberLabel(1047)).toBe('#1047');
    expect(reportNumberLabel(undefined)).toBe('');
  });
});

describe('the staff search (review fix 1)', () => {
  const result = { id: 'u', group: 'collectors' as const, title: 'Maya', line: '@maya', link: [] };

  it('maps the one endpoint of stage WH2: a card opens in the drawer, a report by number', () => {
    const results = fromStaffSearch(
      {
        collectors: [
          {
            id: 'u1',
            handle: 'maya_k',
            displayName: 'Maya Kashani',
            email: 'maya_k@example.test',
            status: 'ACTIVE',
          },
        ],
        cards: [{ id: 'c1', name: 'Dark Magician', game: 'yugioh', printingCode: 'LOB-EN005' }],
        reports: [
          { id: 'r1', number: 1047, reason: 'SCAM', status: 'OPEN', reportedHandle: 'maya_k' },
        ],
      },
      () => 'Yu-Gi-Oh!',
      () => 'Scam or fraud',
    );
    expect(results.map((r) => [r.group, r.title, r.line])).toEqual([
      ['collectors', 'Maya Kashani', '@maya_k · maya_k@example.test'],
      ['cards', 'Dark Magician', 'Yu-Gi-Oh! · LOB-EN005'],
      ['reports', '#1047 · @maya_k', 'Scam or fraud'],
    ]);
    expect(results[1].link).toEqual(['/admin/cards']);
    expect(results[1].query).toEqual({ open: 'c1' });
  });

  it('tells a moderator who typed words that moderators search report numbers only', () => {
    expect(staffEmptyLine(false, parseStaffQuery('maya'))).toBe(
      'Moderators search report numbers only. Type a number such as #1047.',
    );
    expect(staffEmptyLine(false, parseStaffQuery('#1047'))).toBe('No report has this number.');
    expect(staffEmptyLine(true, parseStaffQuery('maya'))).toContain('printing code');
  });

  it('reads a failure as an error, not as "nothing matches"', () => {
    expect(staffSearchFailed([{ results: [], failed: true }])).toBe(true);
    expect(
      staffSearchFailed([
        { results: [], failed: true },
        { results: [], failed: false },
      ]),
    ).toBe(true);
    // Partial results are shown as they are; nothing failed is "no match".
    expect(
      staffSearchFailed([
        { results: [result], failed: false },
        { results: [], failed: true },
      ]),
    ).toBe(false);
    expect(staffSearchFailed([{ results: [], failed: false }])).toBe(false);
  });
});
