import { useSession } from '@/src/auth/session';

/** Firebase uid of the signed-in collector (keys every `['me', uid, ...]` query). */
export function useUid(): string | null {
  return useSession().user?.uid ?? null;
}

/** True once Firebase restored a signed-in user (gates every `/me/**` query). */
export function useIsAuthenticated(): boolean {
  return useSession().status === 'authenticated';
}
