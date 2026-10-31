import { ROLE_LABELS, adminNavFor, openCountLabel, staffRoleOf } from './admin-nav';

const labels = (role: Parameters<typeof adminNavFor>[0], payments: boolean) =>
  adminNavFor(role, payments).flatMap((group) => group.items.map((item) => item.label));

describe('the console nav (spec 15.1, 15.9)', () => {
  it('gives moderators the Overview and the four MODERATION items, 5 in all', () => {
    expect(labels('MODERATOR', true)).toEqual([
      'Overview',
      'Reports',
      'Flags and rules',
      'Community',
      'Ratings',
    ]);
    expect(adminNavFor('MODERATOR', true).map((group) => group.label)).toEqual([
      null,
      'Moderation',
    ]);
  });

  it('groups every page for administrators, PAYMENTS only while protectedPayments is on', () => {
    const groups = adminNavFor('ADMIN', false).map((group) => group.label);
    expect(groups).toEqual([null, 'Moderation', 'Collectors', 'Catalog', 'Rules', 'System']);
    expect(labels('ADMIN', false)).not.toContain('Transactions');
    expect(labels('SUPER_ADMIN', true).slice(-3)).toEqual(['Transactions', 'Disputes', 'Payments']);
    expect(labels('ADMIN', true)).toContain('Audit log');
  });

  it('counts only the queues that need a person', () => {
    const items = adminNavFor('ADMIN', false).flatMap((group) => group.items);
    expect(items.filter((item) => item.count).map((item) => item.id)).toEqual(['reports', 'flags']);
    expect(openCountLabel(5)).toBe('5 open');
  });

  it('reads the highest staff role and its pill', () => {
    expect(staffRoleOf(['USER', 'MODERATOR', 'SUPER_ADMIN'])).toBe('SUPER_ADMIN');
    expect(staffRoleOf(['USER', 'ADMIN'])).toBe('ADMIN');
    expect(staffRoleOf(['USER', 'MODERATOR'])).toBe('MODERATOR');
    expect(staffRoleOf(['USER'])).toBeNull();
    expect(adminNavFor(null, true)).toEqual([]);
    expect(ROLE_LABELS.SUPER_ADMIN).toBe('Super admin');
  });
});
