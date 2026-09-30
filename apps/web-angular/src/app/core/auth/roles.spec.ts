import { hasAdminRole, roleList, rolePayload } from './roles';

describe('roles', () => {
  it('normalises arrays and sets, drops unknown values and sorts by privilege', () => {
    expect(roleList(['ADMIN', 'USER', 'BOGUS'])).toEqual(['USER', 'ADMIN']);
    expect(roleList(new Set(['SUPER_ADMIN', 'MODERATOR']))).toEqual(['MODERATOR', 'SUPER_ADMIN']);
    expect(roleList(null)).toEqual([]);
  });

  it('serialises role payloads as JSON arrays (a Set would become {})', () => {
    const payload = rolePayload(['USER', 'MODERATOR']);
    expect(JSON.stringify({ roles: payload })).toBe('{"roles":["USER","MODERATOR"]}');
  });

  it('recognises administrators', () => {
    expect(hasAdminRole(['USER', 'ADMIN'])).toBe(true);
    expect(hasAdminRole(['USER', 'SUPER_ADMIN'])).toBe(true);
    expect(hasAdminRole(['USER', 'MODERATOR'])).toBe(false);
  });
});
