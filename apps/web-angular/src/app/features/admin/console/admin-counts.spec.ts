import type { AdminDashboard } from '@orenji/api-client';
import { dashboardQueueCounts, moderatorQueueCounts } from './admin-counts.service';

describe('the open counts (spec 15.3)', () => {
  it('counts Open and Under review together, as the dashboard does', () => {
    expect(moderatorQueueCounts(2, 3, 1)).toEqual({
      reports: 5,
      unassigned: 2,
      underReview: 3,
      flags: 1,
    });
    expect(
      dashboardQueueCounts({
        openReports: 5,
        unassignedReports: 2,
        openModerationFlags: 4,
      } as AdminDashboard),
    ).toEqual({ reports: 5, unassigned: 2, underReview: 3, flags: 4 });
  });
});
