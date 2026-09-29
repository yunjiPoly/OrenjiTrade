import type { RequiredConsent } from '@orenji/shared-types';
import { create } from 'zustand';

import { isApiError, type ApiError } from './ApiError';
import { ME_QUERY_KEY } from './queries/keys';
import { queryClient } from './queryClient';

/**
 * Account-state signals raised by the API client: any endpoint may answer
 * `428 TERMS_ACCEPTANCE_REQUIRED` (new legal document version) or `403 ACCOUNT_SUSPENDED`.
 * The client records the signal here and invalidates `GET /me`; `useMe()` merges the signal
 * with the fresh `/me` answer so every gated screen reacts without each call handling it.
 */
export type AccountSignal =
  | { kind: 'consentRequired'; requiredConsents: RequiredConsent[]; at: number }
  | { kind: 'suspended'; suspendedUntil: string | null; at: number };

export interface AccountSignalStore {
  signal: AccountSignal | null;
  report: (signal: AccountSignal) => void;
  clear: () => void;
}

/** Not persisted: a signal is only meaningful for the current session. */
export const useAccountSignalStore = create<AccountSignalStore>()((set) => ({
  signal: null,
  report: (signal) => set({ signal }),
  clear: () => set({ signal: null }),
}));

export function signalFromApiError(error: unknown, now: number = Date.now()): AccountSignal | null {
  if (!isApiError(error)) {
    return null;
  }
  if (error.isSuspended) {
    return { kind: 'suspended', suspendedUntil: error.suspendedUntil, at: now };
  }
  if (error.isConsentRequired) {
    return { kind: 'consentRequired', requiredConsents: error.requiredConsents, at: now };
  }
  return null;
}

const ME_PATH = /\/api\/v1\/me\/?(\?.*)?$/;

/**
 * Called by the API client for every failed request. `/me` itself is skipped: its errors are
 * surfaced by `useMe()` directly and re-fetching it from here would loop.
 */
export function reportAccountSignal(error: ApiError, requestUrl: string | null): AccountSignal | null {
  if (requestUrl && ME_PATH.test(requestUrl)) {
    return null;
  }
  const signal = signalFromApiError(error);
  if (signal === null) {
    return null;
  }
  useAccountSignalStore.getState().report(signal);
  void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  return signal;
}

export function clearAccountSignal(): void {
  useAccountSignalStore.getState().clear();
}
