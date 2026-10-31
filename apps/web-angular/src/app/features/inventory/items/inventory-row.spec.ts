import { shortAge, spokenAge } from './inventory-row';

describe('the Updated column (spec 9.4)', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  it('reads short and is spoken in full', () => {
    expect(shortAge('2026-10-28T11:59:50Z', now)).toBe('now');
    expect(shortAge('2026-10-28T11:30:00Z', now)).toBe('30 min');
    expect(shortAge('2026-10-28T10:00:00Z', now)).toBe('2 h');
    expect(shortAge('2026-10-26T12:00:00Z', now)).toBe('2 d');
    expect(shortAge('2026-10-07T12:00:00Z', now)).toBe('3 w');
    expect(shortAge('2026-06-28T12:00:00Z', now)).toBe('4 mo');
    expect(shortAge(null, now)).toBe('');
    expect(spokenAge('2 h')).toBe('2 hours ago');
    expect(spokenAge('1 d')).toBe('1 day ago');
    expect(spokenAge('now')).toBe('just now');
  });
});
