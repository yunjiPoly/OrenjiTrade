import { create } from 'zustand';

import { isApiError } from './ApiError';
import type { RequiredConsent } from './types';

/**
 * Account-state answers raised by ANY endpoint (mirror of the web's `sessionInterceptor`):
 * `428 TERMS_ACCEPTANCE_REQUIRED` (a new legal document version) and `403 ACCOUNT_SUSPENDED`
 * (suspended, deleted, or "deletion pending"). The API client records them here; the account
 * provider merges them with `GET /me` and reloads it, so the gate reacts without every screen
 * handling these codes. Not persisted: a signal only matters for the current session.
 */
export type AccountSignal =
  | { kind: 'consent-required'; requiredConsents: RequiredConsent[]; at: number }
  | { kind: 'suspended'; message: string; suspendedUntil: string | null; at: number }
  | { kind: 'deletion-pending'; at: number };

export interface AccountSignalStore {
  signal: AccountSignal | null;
  report: (signal: AccountSignal) => void;
  clear: () => void;
}

export const useAccountSignalStore = create<AccountSignalStore>()((set) => ({
  signal: null,
  report: (signal) => set({ signal }),
  clear: () => set({ signal: null }),
}));

/** The signal an error carries, if any. */
export function signalFromError(error: unknown, now: number = Date.now()): AccountSignal | null {
  if (!isApiError(error)) {
    return null;
  }
  if (error.isDeletionPending) {
    return { kind: 'deletion-pending', at: now };
  }
  if (error.isAccountSuspended) {
    return {
      kind: 'suspended',
      message: error.message,
      suspendedUntil: error.suspendedUntil,
      at: now,
    };
  }
  if (error.isConsentRequired) {
    return { kind: 'consent-required', requiredConsents: error.requiredConsents, at: now };
  }
  return null;
}

const ME_PATH = /\/api\/v1\/me\/?(\?.*)?$/;

/**
 * Called by the API client for every failed request. `GET /me` itself is skipped: the account
 * provider reads its errors directly (and re-fetching it from here would loop).
 */
export function reportAccountSignal(
  error: unknown,
  requestUrl: string | null
): AccountSignal | null {
  if (requestUrl && ME_PATH.test(requestUrl)) {
    return null;
  }
  const signal = signalFromError(error);
  if (signal !== null) {
    useAccountSignalStore.getState().report(signal);
  }
  return signal;
}

export function clearAccountSignal(): void {
  useAccountSignalStore.getState().clear();
}
