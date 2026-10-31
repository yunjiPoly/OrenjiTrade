import {
  orderedResults,
  parseStaffQuery,
  reportNumberLabel,
  staffQueryReady,
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
