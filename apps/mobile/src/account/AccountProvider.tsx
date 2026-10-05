import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';

import type { ApiError } from '@/src/api/ApiError';
import { clearAccountSignal, useAccountSignalStore } from '@/src/api/accountSignal';
import { api, required } from '@/src/api/client';
import { ME_ROOT, meKeys } from '@/src/api/queryKeys';
import type { ConsentRequest, MeResponse, RequiredConsent } from '@/src/api/types';
import { useSession } from '@/src/auth/session';

import { useFlowLock } from './flowLock';
import {
  deriveAccountStatus,
  needsOnboarding,
  type AccountStatus,
  type SuspensionInfo,
} from './accountStatus';

export interface Account {
  status: AccountStatus;
  /** `GET /api/v1/me` once it answered (kept while a refresh is in flight). */
  me: MeResponse | null;
  /** The last `/me` failure (status `error`). */
  error: ApiError | null;
  /** True while `/me` is (re)loading. */
  refreshing: boolean;
  requiredConsents: RequiredConsent[];
  suspension: SuspensionInfo | null;
  needsOnboarding: boolean;
  /** Display name for headers: profile name, handle, email, or "Collector". */
  displayName: string;
  handle: string | null;
  /** Reloads `/me` and resolves with the fresh status. */
  reload: () => Promise<void>;
  /** `POST /me/consents` for each document, then reloads `/me`. Rejects with the first ApiError. */
  acceptConsents: (consents: readonly ConsentRequest[]) => Promise<void>;
}

const AccountContext = createContext<Account | null>(null);

/**
 * `GET /api/v1/me` (provisions the account on the first authenticated call; exempt from the terms
 * check) cleared of any account signal once it answers.
 */
export async function fetchMe(): Promise<MeResponse> {
  const { data } = await api.GET('/api/v1/me');
  clearAccountSignal();
  return required(data);
}

/** The collector's account as the API sees it, shared by the gate and every screen. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const uid = session.user?.uid ?? null;
  const signal = useAccountSignalStore((store) => store.signal);
  const authenticated = session.status === 'authenticated';
  // Sign-up holds the flow lock until the consents are recorded: `/me` waits, so the account is
  // provisioned by `POST /me/consents` with the token that already carries the chosen name.
  const flowLocked = useFlowLock((store) => store.lockedBy !== null);

  const query = useQuery<MeResponse, ApiError>({
    queryKey: meKeys.account(uid),
    queryFn: fetchMe,
    enabled: authenticated && !flowLocked,
    staleTime: 60_000,
    // Retries follow the client defaults (`createQueryClient`): 403/428 answers are states, never
    // retried; transport and server failures are retried twice before the retryable error screen.
  });

  // Another endpoint answered 428/403: `/me` tells the whole story.
  useEffect(() => {
    if (signal && authenticated) {
      void queryClient.invalidateQueries({ queryKey: meKeys.account(uid) });
    }
  }, [authenticated, queryClient, signal, uid]);

  const { refetch } = query;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const acceptConsents = useCallback(
    async (consents: readonly ConsentRequest[]) => {
      for (const consent of consents) {
        await api.POST('/api/v1/me/consents', {
          body: { documentType: consent.documentType, version: consent.version },
        });
      }
      clearAccountSignal();
      // Invalidate by prefix: during sign-up the uid of this render may already be stale.
      await queryClient.invalidateQueries({ queryKey: ME_ROOT, refetchType: 'active' });
    },
    [queryClient]
  );

  const account = useMemo<Account>(() => {
    const me = query.data ?? null;
    const derived = deriveAccountStatus({
      sessionStatus: session.status,
      me: query.data,
      error: query.error ?? null,
      isPending: query.isPending,
      signal,
    });
    return {
      ...derived,
      me,
      error: derived.status === 'error' ? (query.error ?? null) : null,
      refreshing: query.isFetching,
      needsOnboarding: derived.status === 'ready' && needsOnboarding(query.data),
      displayName: me?.displayName?.trim() || me?.handle || session.user?.email || 'Collector',
      handle: me?.handle ?? null,
      reload,
      acceptConsents,
    };
  }, [
    acceptConsents,
    query.data,
    query.error,
    query.isFetching,
    query.isPending,
    reload,
    session.status,
    session.user?.email,
    signal,
  ]);

  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

export function useAccount(): Account {
  const account = useContext(AccountContext);
  if (account === null) {
    throw new Error('useAccount() must be used within <AccountProvider>.');
  }
  return account;
}
