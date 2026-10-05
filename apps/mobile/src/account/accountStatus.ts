import type { ApiError } from '@/src/api/ApiError';
import type { AccountSignal } from '@/src/api/accountSignal';
import type { MeResponse, RequiredConsent } from '@/src/api/types';
import type { SessionStatus } from '@/src/auth/sessionReducer';

/**
 * Where the signed-in collector stands with the API (same states as the web's `SessionService`):
 * - `anonymous`: nobody is signed in;
 * - `loading`: Firebase or `GET /me` has not answered yet;
 * - `ready`: active account, every current legal document accepted;
 * - `consent-required`: `requiredConsents` is not empty (428 on every other route);
 * - `suspended`: 403 `ACCOUNT_SUSPENDED` (temporary, or without an end date: banned), or deleted;
 * - `deletion-pending`: the owner asked for deletion; only /me, export and cancel work;
 * - `error`: `/me` failed (offline, server error, session expired); retryable.
 */
export type AccountStatus =
  | 'anonymous'
  | 'loading'
  | 'ready'
  | 'consent-required'
  | 'suspended'
  | 'deletion-pending'
  | 'error';

export interface SuspensionInfo {
  message: string;
  /** End of a temporary suspension (ISO timestamp); null when it has no end date. */
  until: string | null;
}

export interface AccountSnapshot {
  status: AccountStatus;
  requiredConsents: RequiredConsent[];
  suspension: SuspensionInfo | null;
}

export interface DeriveAccountInput {
  sessionStatus: SessionStatus;
  me: MeResponse | undefined;
  error: ApiError | null;
  isPending: boolean;
  signal: AccountSignal | null;
}

const DEFAULT_SUSPENSION: SuspensionInfo = { message: 'This account is suspended.', until: null };

function snapshot(
  status: AccountStatus,
  extra: Partial<Omit<AccountSnapshot, 'status'>> = {}
): AccountSnapshot {
  return { status, requiredConsents: [], suspension: null, ...extra };
}

/** Pure derivation of the account status; unit-tested on its own. */
export function deriveAccountStatus(input: DeriveAccountInput): AccountSnapshot {
  const { sessionStatus, me, error, isPending, signal } = input;

  if (sessionStatus === 'loading') {
    return snapshot('loading');
  }
  if (sessionStatus === 'anonymous') {
    return snapshot('anonymous');
  }

  // A signal from another endpoint is newer than the cached `/me` (it is cleared by the next
  // successful `/me`).
  if (signal?.kind === 'deletion-pending') {
    return snapshot('deletion-pending');
  }
  if (signal?.kind === 'suspended') {
    return snapshot('suspended', {
      suspension: {
        message: signal.message || DEFAULT_SUSPENSION.message,
        until: signal.suspendedUntil,
      },
    });
  }

  if (error) {
    if (error.isDeletionPending) {
      return snapshot('deletion-pending');
    }
    if (error.isAccountSuspended) {
      return snapshot('suspended', {
        suspension: {
          message: error.message || DEFAULT_SUSPENSION.message,
          until: error.suspendedUntil,
        },
      });
    }
    if (!me) {
      return snapshot('error');
    }
    // Offline or a server hiccup with a cached answer: keep working with what we have.
  }

  if (!me) {
    return snapshot(isPending ? 'loading' : 'error');
  }

  switch (me.status) {
    case 'DELETION_REQUESTED':
      return snapshot('deletion-pending');
    case 'SUSPENDED':
    case 'DELETED':
      return snapshot('suspended', { suspension: DEFAULT_SUSPENSION });
    default:
      break;
  }

  const requiredConsents =
    me.requiredConsents.length > 0
      ? me.requiredConsents
      : signal?.kind === 'consent-required'
        ? signal.requiredConsents
        : [];
  if (requiredConsents.length > 0 || signal?.kind === 'consent-required') {
    return snapshot('consent-required', { requiredConsents });
  }
  return snapshot('ready');
}

/** Profile saved at least once and at least one game or tag chosen (web: `needsOnboarding`). */
export function needsOnboarding(me: MeResponse | undefined): boolean {
  const onboarding = me?.onboarding;
  return !!onboarding && (!onboarding.profileComplete || !onboarding.interestsSet);
}
