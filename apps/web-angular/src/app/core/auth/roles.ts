import { MeResponseRolesEnum } from '@orenji/api-client';

/** Role names as sent by the API (`USER`, `MODERATOR`, ...). */
export type Role = `${MeResponseRolesEnum}`;

/** Every role, lowest privilege first (display order). */
export const ALL_ROLES: readonly Role[] = [
  'USER',
  'PREMIUM_USER',
  'MODERATOR',
  'ADMIN',
  'SUPER_ADMIN',
];

/** Roles only a SUPER_ADMIN may grant or revoke (AdminUserService rules). */
export const PRIVILEGED_ROLES: readonly Role[] = ['ADMIN', 'SUPER_ADMIN'];

export const ROLE_LABELS: Record<Role, string> = {
  USER: 'Collector',
  PREMIUM_USER: 'Premium',
  MODERATOR: 'Moderator',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super admin',
};

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as readonly string[]).includes(value);
}

/**
 * Normalises a role collection. The generated client types `uniqueItems` arrays as `Set`, but
 * JSON responses are plain arrays, so this accepts any iterable and returns a sorted array.
 */
export function roleList(roles: Iterable<unknown> | null | undefined): Role[] {
  if (!roles) {
    return [];
  }
  const found = new Set(Array.from(roles).filter(isRole));
  return ALL_ROLES.filter((role) => found.has(role));
}

/**
 * Builds a role payload for the generated client. `HttpClient` serialises a real `Set` as `{}`,
 * so the API receives the array the contract expects while the generated type stays satisfied.
 */
export function rolePayload<T extends string>(roles: readonly Role[]): Set<T> {
  return [...roles] as unknown as Set<T>;
}

export function hasAdminRole(roles: readonly Role[]): boolean {
  return roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
}
