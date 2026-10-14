import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isApiError, type ApiError } from '@/src/api/ApiError';
import { useIsAuthenticated, useUid } from '@/src/api/hooks/useUid';
import { meKeys } from '@/src/api/queryKeys';

export type CheckoutKind = 'payment' | 'billing' | 'donation';
export type CheckoutStatus = 'loading' | 'ready' | 'processing' | 'done' | 'not-found' | 'error';
/** How a checkout ended: paid, declined (may be retried), cancelled, or no answer yet. */
export type CheckoutOutcome = 'succeeded' | 'failed' | 'cancelled' | 'pending';
export type ConfirmOutcome = 'SUCCEEDED' | 'FAILED';

export interface ProviderCheckoutSource<T> {
  /** `GET` of the checkout (the caller's own; 404 for anybody else). */
  read: (ref: string) => Promise<T>;
  /** `POST …/confirm` with the simulated outcome. */
  send: (ref: string, outcome: ConfirmOutcome) => Promise<unknown>;
  /**
   * How the checkout ended, or `null` while it still waits. `requested` is the outcome just sent
   * (`null` on the first read): a declined attempt leaves some checkouts open for a retry.
   */
  outcomeOf: (checkout: T, requested: ConfirmOutcome | null) => CheckoutOutcome | null;
}

export interface ProviderCheckoutOptions {
  /** Delay between two reads while waiting for the webhook (tests shorten it). */
  pollDelayMs?: number;
  /** Reads before giving up (about 45 s: webhooks are applied asynchronously). */
  maxPolls?: number;
}

export interface ProviderCheckoutState<T> {
  checkout: T | null;
  status: CheckoutStatus;
  outcome: CheckoutOutcome | null;
  /** The read failed (`status` error) or the confirmation was refused (`status` ready). */
  error: ApiError | null;
  retry: () => void;
  /** Back to the pay buttons after a declined attempt that left the checkout open. */
  tryAgain: () => void;
  /** Pays or simulates a declined payment; resolves how it ended (`null` when refused). */
  confirm: (outcome: ConfirmOutcome) => Promise<CheckoutOutcome | null>;
}

type Phase = { kind: 'idle' } | { kind: 'processing' } | { kind: 'done'; outcome: CheckoutOutcome };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isNotFound(error: ApiError): boolean {
  return error.status === 404 || error.status === 403 || error.errorCode === 'VALIDATION_FAILED';
}

/**
 * The state machine of the local fake provider checkouts (protected payments, subscriptions and
 * donations; mirror of the web's `ProviderCheckoutStore` / `FakeCheckoutStore`): read the
 * checkout, "Pay" or "Simulate a failed payment" through the confirm route (the API emits a
 * signed synthetic webhook through its regular pipeline), then read the checkout again until the
 * webhook changed it. A 409 on confirm means it no longer waits: how it ended is read instead.
 * Never real money.
 */
export function useProviderCheckout<T>(
  kind: CheckoutKind,
  ref: string | null | undefined,
  source: ProviderCheckoutSource<T>,
  { pollDelayMs = 750, maxPolls = 60 }: ProviderCheckoutOptions = {}
): ProviderCheckoutState<T> {
  const uid = useUid();
  const queryClient = useQueryClient();
  const key = meKeys.checkout(uid, kind, ref ?? '');
  const query = useQuery<T, ApiError>({
    queryKey: key,
    queryFn: () => source.read(ref ?? ''),
    enabled: useIsAuthenticated() && !!ref,
    staleTime: 0,
    retry: false,
  });
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [confirmError, setConfirmError] = useState<ApiError | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const data = query.data ?? null;
  let status: CheckoutStatus;
  let outcome: CheckoutOutcome | null = null;
  if (!ref) {
    status = 'not-found';
  } else if (query.error && !data) {
    status = isNotFound(query.error) ? 'not-found' : 'error';
  } else if (!data) {
    status = 'loading';
  } else if (phase.kind === 'processing') {
    status = 'processing';
  } else if (phase.kind === 'done') {
    status = 'done';
    outcome = phase.outcome;
  } else {
    outcome = source.outcomeOf(data, null);
    status = outcome ? 'done' : 'ready';
  }

  const { refetch } = query;
  const retry = useCallback(() => void refetch(), [refetch]);

  const tryAgain = useCallback(() => {
    setPhase((current) =>
      current.kind === 'done' && current.outcome === 'failed' ? { kind: 'idle' } : current
    );
  }, []);

  const { read, send, outcomeOf } = source;
  const confirm = useCallback(
    async (requested: ConfirmOutcome): Promise<CheckoutOutcome | null> => {
      if (!ref || status !== 'ready') {
        return null;
      }
      setPhase({ kind: 'processing' });
      setConfirmError(null);
      try {
        await send(ref, requested);
      } catch (caught) {
        if (!isApiError(caught) || caught.status !== 409) {
          setConfirmError(isApiError(caught) ? caught : null);
          setPhase({ kind: 'idle' });
          return null;
        }
        // 409: the checkout is no longer waiting (paid elsewhere, cancelled): read how it ended.
      }
      for (let poll = 0; poll < maxPolls && mounted.current; poll++) {
        try {
          const value = await read(ref);
          queryClient.setQueryData(meKeys.checkout(uid, kind, ref), value);
          const ended = outcomeOf(value, requested);
          if (ended) {
            setPhase({ kind: 'done', outcome: ended });
            return ended;
          }
        } catch {
          // A lost answer: try again after the delay.
        }
        await wait(pollDelayMs);
      }
      setPhase({ kind: 'done', outcome: 'pending' });
      return 'pending';
    },
    [ref, status, send, read, outcomeOf, maxPolls, pollDelayMs, queryClient, uid, kind]
  );

  return {
    checkout: data,
    status,
    outcome,
    error: status === 'error' ? query.error : confirmError,
    retry,
    tryAgain,
    confirm,
  };
}

/** How a protected payment's checkout ended (`null` while it waits to be paid). */
export function paymentOutcome(checkout: { status: string }): CheckoutOutcome | null {
  switch (checkout.status) {
    case 'REQUIRES_ACTION':
      return null;
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
    case 'REFUNDED':
      return 'cancelled';
    default:
      return 'succeeded';
  }
}

/** A subscription that gives its plan right now (TRIAL, ACTIVE, PAST_DUE). */
export function isEntitling(status: string | null | undefined): boolean {
  return status === 'TRIAL' || status === 'ACTIVE' || status === 'PAST_DUE';
}

/**
 * How a subscription checkout ended. A declined attempt leaves the subscription PENDING with a
 * `failureCode` (the member may try again); the webhook of a payment turns it ACTIVE; an
 * abandoned checkout is CANCELLED.
 */
export function billingOutcome(
  checkout: { status?: string; failureCode?: string | null },
  requested: ConfirmOutcome | null
): CheckoutOutcome | null {
  if (isEntitling(checkout.status)) {
    return 'succeeded';
  }
  if (checkout.status === 'CANCELLED' || checkout.status === 'EXPIRED') {
    return 'cancelled';
  }
  return requested === 'FAILED' && checkout.failureCode ? 'failed' : null;
}

/** How a donation checkout ended (`null` while it still waits to be paid). */
export function donationOutcome(checkout: { status?: string }): CheckoutOutcome | null {
  switch (checkout.status) {
    case 'SUCCEEDED':
      return 'succeeded';
    case 'FAILED':
      return 'failed';
    case 'REFUNDED':
      return 'cancelled';
    default:
      return null;
  }
}
