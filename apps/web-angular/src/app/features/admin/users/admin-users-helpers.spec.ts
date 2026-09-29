import { exportFileName } from '../../../core/account/account-export.service';
import { auditActionLabel, summarizeDetails } from '../shared/admin-labels';
import { roleLockReason } from './roles-editor.component';
import { endOfDayIso, tomorrowIso } from './suspend-dialog.component';

describe('roleLockReason', () => {
  const base = { actorIsSuperAdmin: false, isSelf: false, current: ['USER' as const] };

  it('always locks USER', () => {
    expect(roleLockReason('USER', { ...base, actorIsSuperAdmin: true })).toContain('USER');
  });

  it('lets admins manage PREMIUM_USER and MODERATOR only', () => {
    expect(roleLockReason('MODERATOR', base)).toBeNull();
    expect(roleLockReason('PREMIUM_USER', base)).toBeNull();
    expect(roleLockReason('ADMIN', base)).toBe('Only a super admin can grant or revoke this role.');
    expect(roleLockReason('SUPER_ADMIN', base)).not.toBeNull();
  });

  it('lets super admins grant ADMIN but not drop their own SUPER_ADMIN', () => {
    const superAdmin = {
      actorIsSuperAdmin: true,
      isSelf: true,
      current: ['USER', 'SUPER_ADMIN'] as ('USER' | 'SUPER_ADMIN')[],
    };
    expect(roleLockReason('ADMIN', superAdmin)).toBeNull();
    expect(roleLockReason('SUPER_ADMIN', superAdmin)).toBe(
      'You cannot remove your own super admin role.',
    );
  });
});

describe('suspension dates', () => {
  it('computes tomorrow and the end of a local day', () => {
    expect(tomorrowIso(new Date(2026, 8, 30, 15, 0))).toBe('2026-10-01');
    const end = new Date(endOfDayIso('2026-10-01'));
    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours()]).toEqual([
      2026, 9, 1, 23,
    ]);
  });
});

describe('admin labels', () => {
  it('humanises audit actions and summarises details', () => {
    expect(auditActionLabel('user.suspend')).toBe('Suspended an account');
    expect(auditActionLabel('custom.action')).toBe('custom.action');
    expect(summarizeDetails({ reason: 'spam', until: null, roles: ['USER', 'ADMIN'] })).toBe(
      'reason: spam · roles: USER, ADMIN',
    );
  });
});

describe('exportFileName', () => {
  it('includes the handle and the date', () => {
    expect(exportFileName('maika', new Date('2026-09-29T12:00:00Z'))).toBe(
      'orenjitrade-export-maika-2026-09-29.json',
    );
    expect(exportFileName(null, new Date('2026-09-29T12:00:00Z'))).toBe(
      'orenjitrade-export-account-2026-09-29.json',
    );
  });
});
