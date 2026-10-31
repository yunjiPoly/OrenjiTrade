import type { ReportSummary } from '@orenji/api-client';
import { canTakeReport, staffActions } from './admin-overview.component';

const report = (status: string, assignee: unknown = undefined) =>
  ({ status, assignee }) as unknown as Pick<ReportSummary, 'status' | 'assignee'>;

describe('the Overview (review fix 1)', () => {
  it('offers "Assign to me" only on an Open report nobody holds', () => {
    expect(canTakeReport(report('OPEN'))).toBe(true);
    expect(canTakeReport(report('OPEN', { id: 'm', handle: 'mod', displayName: 'Mod' }))).toBe(
      false,
    );
    expect(canTakeReport(report('UNDER_REVIEW'))).toBe(false);
    expect(canTakeReport(report('ACTIONED'))).toBe(false);
  });

  it("lists staff actions only, never a collector's own audit rows", () => {
    const entry = (id: string, type: string) => ({ id, actor: { type } });
    const entries = [
      entry('1', 'USER'),
      entry('2', 'ADMIN'),
      entry('3', 'SYSTEM'),
      entry('4', 'ADMIN'),
      entry('5', 'ADMIN'),
      entry('6', 'USER'),
      entry('7', 'ADMIN'),
      entry('8', 'ADMIN'),
      entry('9', 'ADMIN'),
    ];
    expect(staffActions(entries).map((item) => item.id)).toEqual(['2', '4', '5', '7', '8']);
    expect(staffActions([entry('1', 'USER')])).toEqual([]);
  });
});
