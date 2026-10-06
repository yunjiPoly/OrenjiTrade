import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { getIdToken } from '@/src/auth/tokenProvider';

import { ApiError } from '../ApiError';
import { absoluteApiUrl, api, required } from '../client';
import type { PickedImage } from '../imageFormData';
import { imageFormData } from '../imageFormData';
import { meKeys } from '../queryKeys';
import type {
  Dispute,
  DisputeEvidence,
  DisputeMessage,
  FakeCheckout,
  OpenDisputeRequest,
  ProtectedPayment,
  SellerAccount,
  SellerOnboarding,
  ShipTradeRequest,
  TradeResponse,
} from '../types';
import { useIsAuthenticated, useUid } from './useUid';

type Uid = string | null;

/**
 * `GET /api/v1/me/seller-account`: the caller's payout account (Settings → Payouts, and a
 * seller's trade waiting for a protected payment). 404 `FEATURE_DISABLED` while the
 * `protectedPayments` flag is off for the caller. No bank details ever reach OrenjiTrade.
 */
export function useSellerAccount(enabled = true) {
  const uid = useUid();
  return useQuery<SellerAccount, ApiError>({
    queryKey: meKeys.sellerAccount(uid),
    queryFn: async () => required((await api.GET('/api/v1/me/seller-account')).data),
    enabled: useIsAuthenticated() && enabled,
    staleTime: 0,
  });
}

/**
 * `POST /api/v1/me/seller-account/onboarding`: starts (or resumes) the payout setup at the
 * provider; answers where to continue (`url`: a web path with the local fake provider, which
 * activates the account at once; the provider's hosted page otherwise).
 */
export function useStartOnboarding() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<SellerOnboarding, ApiError, string>({
    mutationFn: async (returnUrl) =>
      required(
        (await api.POST('/api/v1/me/seller-account/onboarding', { body: { returnUrl } })).data
      ),
    onSuccess: (onboarding) => {
      queryClient.setQueryData(meKeys.sellerAccount(uid), onboarding.account);
    },
  });
}

export type ProtectedStep = 'pay' | 'ship' | 'confirm-receipt' | 'dispute';

/** The answer of a protected step: the checkout, the updated trade, or the opened dispute. */
export type ProtectedAnswer =
  | { step: 'pay'; payment: ProtectedPayment }
  | { step: 'ship' | 'confirm-receipt'; trade: TradeResponse }
  | { step: 'dispute'; dispute: Dispute };

export type ProtectedVariables =
  | { id: string; step: 'pay' }
  | { id: string; step: 'ship'; request: ShipTradeRequest }
  | { id: string; step: 'confirm-receipt' }
  | { id: string; step: 'dispute'; request: OpenDisputeRequest };

function refreshTrades(queryClient: QueryClient, uid: Uid, trade?: TradeResponse) {
  if (trade) {
    queryClient.setQueryData(meKeys.trade(uid, trade.id), trade);
  }
  // The lists; the trade on screen already shows the answer.
  void queryClient.invalidateQueries({ queryKey: [...meKeys.trades(uid), 'list'] });
}

/**
 * The payment-protection steps of a trade (Phase 9, flag `protectedPayments`): pay (`POST
 * /trades/{id}/pay`: where to pay; the trade stays AWAITING_PAYMENT until the provider secures
 * the payment), ship (seller, carrier / tracking / notes), confirm receipt (buyer: releases the
 * payout and completes the trade) and open a dispute (buyer, within the window: the payout goes
 * on hold). Refusals reject with the `ApiError` (409 SELLER_NOT_ONBOARDED, DISPUTE_WINDOW_CLOSED,
 * INVALID_STATE_TRANSITION, 404 FEATURE_DISABLED…).
 */
export function useProtectedStep() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<ProtectedAnswer, ApiError, ProtectedVariables>({
    mutationFn: async (variables) => {
      const path = { params: { path: { id: variables.id } } };
      switch (variables.step) {
        case 'pay':
          return {
            step: 'pay',
            payment: required((await api.POST('/api/v1/trades/{id}/pay', path)).data),
          };
        case 'ship':
          return {
            step: 'ship',
            trade: required(
              (await api.POST('/api/v1/trades/{id}/ship', { ...path, body: variables.request }))
                .data
            ),
          };
        case 'confirm-receipt':
          return {
            step: 'confirm-receipt',
            trade: required((await api.POST('/api/v1/trades/{id}/confirm-receipt', path)).data),
          };
        default:
          return {
            step: 'dispute',
            dispute: required(
              (
                await api.POST('/api/v1/trades/{id}/disputes', {
                  ...path,
                  body: variables.request,
                })
              ).data
            ),
          };
      }
    },
    onSuccess: (answer, variables) => {
      if (answer.step === 'ship' || answer.step === 'confirm-receipt') {
        refreshTrades(queryClient, uid, answer.trade);
        if (answer.trade.status === 'COMPLETED') {
          // The card left the seller's inventory; the other collector can now be rated.
          void queryClient.invalidateQueries({ queryKey: meKeys.inventory(uid) });
          void queryClient.invalidateQueries({ queryKey: meKeys.binders(uid) });
          void queryClient.invalidateQueries({
            queryKey: meKeys.ratingEligibility(uid, answer.trade.counterparty.id),
          });
        }
      } else if (answer.step === 'dispute') {
        queryClient.setQueryData(meKeys.dispute(uid, answer.dispute.id), answer.dispute);
        void queryClient.invalidateQueries({ queryKey: meKeys.trade(uid, variables.id) });
        void queryClient.invalidateQueries({ queryKey: [...meKeys.trades(uid), 'list'] });
      } else {
        // The trade shows the payment (REQUIRES_ACTION) once read again.
        void queryClient.invalidateQueries({ queryKey: meKeys.trade(uid, variables.id) });
      }
    },
  });
}

/** `GET /api/v1/payments/fake/{ref}`: a fake-provider checkout (the buyer only; local only). */
export async function readFakeCheckout(ref: string): Promise<FakeCheckout> {
  return required(
    (await api.GET('/api/v1/payments/fake/{ref}', { params: { path: { ref } } })).data
  );
}

/**
 * `POST /api/v1/payments/fake/{ref}/confirm`: pays (`SUCCEEDED`) or simulates a declined payment
 * (`FAILED`); the API emits a signed synthetic webhook through its regular pipeline, so the
 * payment changes asynchronously.
 */
export async function confirmFakeCheckout(
  ref: string,
  outcome: 'SUCCEEDED' | 'FAILED'
): Promise<void> {
  await api.POST('/api/v1/payments/fake/{ref}/confirm', {
    params: { path: { ref } },
    body: { outcome },
  });
}

/**
 * `GET /api/v1/disputes/{id}`: a dispute with its timeline, evidence and thread (its two
 * parties only: 404 for anybody else). DISPUTE_UPDATE notifications re-read it.
 */
export function useDispute(id: string | null | undefined) {
  const uid = useUid();
  return useQuery<Dispute, ApiError>({
    queryKey: meKeys.dispute(uid, id ?? ''),
    queryFn: async () =>
      required(
        (await api.GET('/api/v1/disputes/{id}', { params: { path: { id: id ?? '' } } })).data
      ),
    enabled: useIsAuthenticated() && !!id,
    staleTime: 0,
  });
}

/** Evidence a party adds from the app: a statement (TEXT) or a photo from the library (IMAGE). */
export type EvidenceDraft =
  { kind: 'TEXT'; body: string } | { kind: 'IMAGE'; photo: PickedImage; caption: string };

/** The multipart body of IMAGE evidence: the `file` part, `kind` and an optional caption. */
export async function evidenceFormData(photo: PickedImage, caption: string): Promise<FormData> {
  const form = await imageFormData(photo, 'evidence');
  form.append('kind', 'IMAGE');
  const body = caption.trim();
  if (body) {
    form.append('body', body);
  }
  return form;
}

/**
 * `POST /api/v1/disputes/{id}/evidence`: TEXT as JSON, IMAGE as multipart (JPEG, PNG or WebP up
 * to 8 MB, re-encoded without metadata by the API). At most 10 per party (409
 * EVIDENCE_LIMIT_REACHED); closed while the dispute is on hold or decided (409
 * INVALID_STATE_TRANSITION). The dispute is read again afterwards.
 */
export function useAddEvidence(disputeId: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<DisputeEvidence, ApiError, EvidenceDraft>({
    mutationFn: async (draft) => {
      const path = { params: { path: { id: disputeId } } };
      if (draft.kind === 'TEXT') {
        return required(
          (
            await api.POST('/api/v1/disputes/{id}/evidence', {
              ...path,
              body: { kind: 'TEXT', body: draft.body.trim() },
            })
          ).data
        );
      }
      const form = await evidenceFormData(draft.photo, draft.caption);
      return required(
        (
          await api.POST('/api/v1/disputes/{id}/evidence', {
            ...path,
            // The contract types the multipart body as `{ file, kind, body }`; the FormData is
            // sent as is.
            body: form as unknown as { file: string; kind: 'IMAGE' },
            bodySerializer: () => form,
          })
        ).data
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: meKeys.dispute(uid, disputeId) });
    },
  });
}

/** `POST /api/v1/disputes/{id}/messages`: a message to the other party and OrenjiTrade. */
export function usePostDisputeMessage(disputeId: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<DisputeMessage, ApiError, string>({
    mutationFn: async (text) =>
      required(
        (
          await api.POST('/api/v1/disputes/{id}/messages', {
            params: { path: { id: disputeId } },
            body: { body: text.trim() },
          })
        ).data
      ),
    onSuccess: (message) => {
      queryClient.setQueryData<Dispute>(meKeys.dispute(uid, disputeId), (current) =>
        current && !current.messages.some((entry) => entry.id === message.id)
          ? { ...current, messages: [...current.messages, message] }
          : current
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: meKeys.dispute(uid, disputeId) });
    },
  });
}

/** Reads a blob as a `data:` URI (works on React Native and in browsers). */
export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The file could not be read.'));
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * The file of IMAGE evidence (`GET /disputes/{id}/evidence/{evidenceId}/file`, `private,
 * no-store`, the two parties only): fetched with the ID token and shown from memory as a `data:`
 * URI, never through a public URL or a disk cache.
 */
export async function fetchEvidenceFile(disputeId: string, evidenceId: string): Promise<string> {
  const url = absoluteApiUrl(
    `/api/v1/disputes/${encodeURIComponent(disputeId)}/evidence/${encodeURIComponent(evidenceId)}/file`
  );
  const token = await getIdToken(false);
  const response = await fetch(url, {
    headers: {
      Accept: 'image/jpeg, image/*',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      errorCode: response.status === 404 ? 'NOT_FOUND' : 'UNKNOWN_ERROR',
      message: 'The photo could not load.',
    });
  }
  return blobToDataUri(await response.blob());
}

/** A photo of IMAGE evidence, loaded once per evidence id. */
export function useEvidencePhoto(disputeId: string, evidenceId: string, enabled = true) {
  const uid = useUid();
  return useQuery<string, ApiError>({
    queryKey: meKeys.evidenceFile(uid, disputeId, evidenceId),
    queryFn: () => fetchEvidenceFile(disputeId, evidenceId),
    enabled: useIsAuthenticated() && enabled,
    staleTime: Infinity,
    // Kept in memory while the dispute is on screen only.
    gcTime: 5 * 60_000,
    retry: false,
  });
}
