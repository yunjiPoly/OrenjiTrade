import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/src/auth/session';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { publicKeys } from '../queryKeys';
import { useUid } from './useUid';

/**
 * Client-visible flag keys (created by API migrations; `GET /public/feature-flags`, mirror of the
 * web's `FEATURE`). Unknown keys are allowed: the server's map is the source of truth.
 */
export const FEATURE = {
  premiumPlans: 'premiumPlans',
  publicChat: 'publicChat',
  protectedPayments: 'protectedPayments',
  advertising: 'advertising',
  donations: 'donations',
  credits: 'credits',
  mlScanning: 'mlScanning',
} as const;

export type KnownFeature = (typeof FEATURE)[keyof typeof FEATURE];

/**
 * `GET /api/v1/public/feature-flags`, evaluated for the signed-in collector (the request carries
 * the ID token, like the web's `ATTACH_ID_TOKEN`), so it is read again for another account.
 * Waits until Firebase restored the session (a signed-in collector never gets the anonymous
 * evaluation first). The API enforces every flag on its own (404 `FEATURE_DISABLED`); the app
 * only hides what is switched off.
 */
export function useFeatureFlags() {
  const uid = useUid();
  const status = useSession().status;
  return useQuery<Record<string, boolean>, ApiError>({
    queryKey: publicKeys.featureFlags(uid),
    queryFn: async () => required((await api.GET('/api/v1/public/feature-flags')).data),
    enabled: status !== 'loading',
    staleTime: 5 * 60_000,
  });
}

/**
 * Whether a flag is on for the current collector: `false` while unknown (loading, error or an
 * unknown key) so a switched-off feature never flashes on screen (web: `FeatureFlagsService`).
 * `known` is true once the server answered: only then is a feature "switched off" (an unreadable
 * answer leaves the decision to the API, which refuses with 404 `FEATURE_DISABLED`).
 */
export function useFeature(key: string): { enabled: boolean; known: boolean } {
  const flags = useFeatureFlags();
  return {
    enabled: flags.data?.[key] === true,
    known: flags.data !== undefined,
  };
}
