import type { ReportedConversationMessage } from '@orenji/api-client';
import { conversationDays } from './report-panel.component';

const message = (id: string, createdAt: string) =>
  ({ id, kind: 'TEXT', body: id, createdAt, moderationState: 'OK' }) as ReportedConversationMessage;

/** `yyyy-MM-dd` of a local date. */
const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

describe('conversationDays (review fix 1, U5 and A7)', () => {
  it('groups by the local calendar day, as the times read, not by the UTC date', () => {
    // 22:58 local on Oct 30 is Oct 31 in UTC anywhere west of Greenwich (EDT: 02:58Z).
    const evening = new Date(2026, 9, 30, 22, 58);
    const morning = new Date(2026, 9, 30, 9, 0);
    const next = new Date(2026, 9, 31, 0, 30);
    // Newest first, as the API sends them.
    const days = conversationDays([
      message('c', next.toISOString()),
      message('b', evening.toISOString()),
      message('a', morning.toISOString()),
    ]);
    expect(days.map((day) => day.day)).toEqual([localDay(morning), localDay(next)]);
    expect(days[0].day).toBe('2026-10-30');
    expect(days[0].messages.map((m) => m.id)).toEqual(['a', 'b']);
    expect(days[1].messages.map((m) => m.id)).toEqual(['c']);
  });
});
