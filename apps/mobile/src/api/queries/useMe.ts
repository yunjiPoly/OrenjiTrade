import type { MeResponse, RequiredConsent } from '@orenji/shared-types';
import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSession } from '@/src/auth/session';
import type { SessionStatus } from '@/src/auth/sessionReducer';

import { ApiError } from '../ApiError';
import { clearAccountSignal, useAccountSignalStore, type AccountSignal } from '../accountState';
import { api, type ApiClient } from '../client';
import { meQueryKey } from './keys';

export { ME_QUERY_KEY, meQueryKey } from './keys';

/**
 * `GET /api/v1/me`. Provisions the account on the first authenticated call; exempt from the
 * terms check so the response carries `requiredConsents`. A fresh answer supersedes any
 * account signal raised by another endpoint.
 */
export async function fetchMe(client: ApiClient = api): Promise<MeResponse> {
  const { data } = await client.GET('/api/v1/me');
  if (data === undefined) {
    // Unreachable in practice: the middleware throws for every non-2xx response.
    throw new ApiError({ status: 0, errorCode: 'EMPTY_RESPONSE', message: 'Empty response' });
  }
  clearAccountSignal();
  return data;
}

/**
 * What the gated screens need to know, derived from the Firebase session, `/me` and the
 * account signals raised by other endpoints (see `accountState.ts`).
 *
 * - `loading`: Firebase is restoring the session or `/me` has not answered yet
 * - `anonymous`: no Firebase user
 * - `active`: signed in, consents up to date
 * - `consentRequired`: a legal document version must be accepted (`/(auth)/consent`)
 * - `suspended`: `403 ACCOUNT_SUSPENDED` (`/(auth)/suspended`)
 * - `error`: `/me` failed for another reason (network, 5xx); retry with `refetch()`
 */
export type AccountState =
  | 'loading'
  | 'anonymous'
  | 'active'
  | 'consentRequired'
  | 'suspended'
  | 'error';

export interface AccountSnapshot {
  accountState: AccountState;
  requiredConsents: RequiredConsent[];
  suspendedUntil: string | null;
}

export interface DeriveAccountStateInput {
  sessionStatus: SessionStatus;
  data: MeResponse | undefined;
  error: ApiError | null;
  isPending: boolean;
  signal: AccountSignal | null;
}

/** Pure derivation, unit-tested on its own. */
export function deriveAccountState(input: DeriveAccountStateInput): AccountSnapshot {
  const { sessionStatus, data, error, isPending, signal } = input;

  if (sessionStatus === 'loading') {
    return { accountState: 'loading', requiredConsents: [], suspendedUntil: null };
  }
  if (sessionStatus === 'anonymous') {
    return { accountState: 'anonymous', requiredConsents: [], suspendedUntil: null };
  }

  if (signal?.kind === 'suspended') {
    return { accountState: 'suspended', requiredConsents: [], suspendedUntil: signal.suspendedUntil };
  }

  if (error) {
    if (error.isSuspended) {
      return { accountState: 'suspended', requiredConsents: [], suspendedUntil: error.suspendedUntil };
    }
    if (error.isConsentRequired) {
      return {
        accountState: 'consentRequired',
        requiredConsents: error.requiredConsents,
        suspendedUntil: null,
      };
    }
    if (!data) {
      return { accountState: 'error', requiredConsents: [], suspendedUntil: null };
    }
    // Stale-but-present data (offline refetch failed): keep working with what we have.
  }

  if (!data) {
    return {
      accountState: isPending ? 'loading' : 'error',
      requiredConsents: [],
      suspendedUntil: null,
    };
  }

  if (data.status === 'SUSPENDED' || data.status === 'DELETION_REQUESTED') {
    return { accountState: 'suspended', requiredConsents: [], suspendedUntil: null };
  }

  const requiredConsents =
    data.requiredConsents.length > 0
      ? data.requiredConsents
      : signal?.kind === 'consentRequired'
        ? signal.requiredConsents
        : [];
  if (requiredConsents.length > 0) {
    return { accountState: 'consentRequired', requiredConsents, suspendedUntil: null };
  }

  return { accountState: 'active', requiredConsents: [], suspendedUntil: null };
}

export type UseMeOptions = Omit<
  UseQueryOptions<MeResponse, ApiError, MeResponse, ReturnType<typeof meQueryKey>>,
  'queryKey' | 'queryFn'
> & {
  /** Override the API client (tests). */
  client?: ApiClient;
};

export type UseMeResult = UseQueryResult<MeResponse, ApiError> & AccountSnapshot;

/**
 * The signed-in collector's account (`GET /api/v1/me`) plus the derived `accountState`.
 * Disabled while anonymous; keyed by Firebase uid; invalidated by `SessionProvider` on every
 * auth change and by the API client whenever an endpoint answers 428 / 403 ACCOUNT_SUSPENDED.
 */
export function useMe(options: UseMeOptions = {}): UseMeResult {
  const { client = api, ...queryOptions } = options;
  const { status, user } = useSession();
  const signal = useAccountSignalStore((store) => store.signal);
  const enabled = status === 'authenticated' && (queryOptions.enabled ?? true);

  const query = useQuery<MeResponse, ApiError, MeResponse, ReturnType<typeof meQueryKey>>({
    queryKey: meQueryKey(user?.uid ?? null),
    queryFn: () => fetchMe(client),
    staleTime: 60_000,
    ...queryOptions,
    enabled,
  });

  const snapshot = useMemo(
    () =>
      deriveAccountState({
        sessionStatus: status,
        data: query.data,
        error: query.error,
        isPending: query.isPending,
        signal,
      }),
    [status, query.data, query.error, query.isPending, signal]
  );

  return { ...query, ...snapshot };
}
