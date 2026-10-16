import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import {
  applyMessageToInbox,
  findConversation,
  patchConversation,
  removeConversation,
  upsertConversation,
  upsertThreadMessage,
  type InboxData,
  type ThreadData,
} from '@/src/features/messages/conversationCache';
import { activeConversationId } from '@/src/features/messages/activeConversation';
import { sendRequest, type MessageDraft } from '@/src/features/messages/messageDraft';

import { ApiError } from '../ApiError';
import { api, required } from '../client';
import { imageFormData } from '../imageFormData';
import { meKeys } from '../queryKeys';
import type {
  ConversationPage,
  ConversationSummary,
  ImageUploadResponse,
  MarkSoldRequest,
  MessagePage,
  MessageResponse,
  SaleResponse,
  StartConversationRequest,
  UpdateConversationRequest,
} from '../types';
import { refreshInventory } from './inventory';
import { refreshBinderListings } from './listingRefresh';
import { refreshUnreadCountSoon } from './notificationCentre';
import { useIsAuthenticated, useUid } from './useUid';

/** Messages per page of a thread (newest first). */
export const MESSAGES_PAGE_SIZE = 30;
/** Conversations per page of the inbox. */
export const CONVERSATIONS_PAGE_SIZE = 30;

export { MESSAGE_MAX_LENGTH } from '@/src/features/messages/messageText';

type Uid = string | null;

/**
 * The fields of a conversation a new message changes (the last message, archived, unread), taken
 * from the inbox's updated copy; everything else (the subject first) stays the conversation's own.
 */
export function withMessageFields(
  current: ConversationSummary,
  updated: ConversationSummary
): ConversationSummary {
  return {
    ...current,
    lastMessage: updated.lastMessage,
    archived: updated.archived,
    unreadCount: updated.unreadCount,
  };
}

/** Keeps the inbox and the conversation's own cache entry in step. */
function patchEverywhere(
  queryClient: QueryClient,
  uid: Uid,
  id: string,
  changes: Partial<ConversationSummary>
): void {
  queryClient.setQueryData<InboxData>(meKeys.conversationList(uid), (data) =>
    patchConversation(data, id, changes)
  );
  queryClient.setQueryData<ConversationSummary>(meKeys.conversation(uid, id), (current) =>
    current ? { ...current, ...changes } : current
  );
}

/**
 * A message sent here or pushed over realtime: into its thread's newest page, and its
 * conversation to the top of the inbox (one more unread when it comes from the other collector
 * and the thread is not on screen). An unknown conversation re-reads the inbox.
 */
export function applyMessageToCaches(
  queryClient: QueryClient,
  uid: Uid,
  selfId: string | null,
  message: MessageResponse
): void {
  queryClient.setQueryData<ThreadData>(meKeys.messages(uid, message.conversationId), (data) =>
    upsertThreadMessage(data, message)
  );
  if (message.payload?.sale) {
    // A sale or its undo (stage R4): the pinned bar's "Sold", the unread count and the last
    // message come from the server; the seller's inventory changed.
    void queryClient.invalidateQueries({ queryKey: meKeys.conversationList(uid) });
    void queryClient.invalidateQueries({
      queryKey: meKeys.conversation(uid, message.conversationId),
    });
    return;
  }
  const onScreen = activeConversationId() === message.conversationId;
  const inbox = queryClient.getQueryData<InboxData>(meKeys.conversationList(uid));
  const result = applyMessageToInbox(inbox, message, selfId, onScreen);
  if (result.found) {
    queryClient.setQueryData(meKeys.conversationList(uid), result.data);
    const updated = findConversation(result.data, message.conversationId);
    if (updated) {
      // Only what a message changes: the inbox's copy of the subject may be older than the
      // conversation's own (review fix 1, F1: the pinned bar went back to an earlier card).
      queryClient.setQueryData<ConversationSummary>(
        meKeys.conversation(uid, updated.id),
        (current) => (current ? withMessageFields(current, updated) : current)
      );
    }
  } else {
    void queryClient.invalidateQueries({ queryKey: meKeys.conversationList(uid) });
  }
  if (message.payload?.item) {
    // A card shared by its owner becomes what the chat is about.
    void queryClient.invalidateQueries({
      queryKey: meKeys.conversation(uid, message.conversationId),
    });
    void queryClient.invalidateQueries({ queryKey: meKeys.conversationList(uid) });
  }
}

/**
 * The inbox (`GET /api/v1/conversations`, most recent activity first, cursor pages): the Messages
 * tab and its badge. Kept live by realtime pushes and re-read after every reconnection.
 */
export function useConversations(enabled = true) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  return useInfiniteQuery<ConversationPage, ApiError>({
    queryKey: meKeys.conversationList(uid),
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/conversations', {
            params: {
              query: {
                cursor: (pageParam as string | null) ?? undefined,
                limit: CONVERSATIONS_PAGE_SIZE,
              },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    enabled: enabled && authenticated,
    staleTime: 30_000,
  });
}

/**
 * `POST /api/v1/conversations` (the web's `ConversationStarterService`): opens the conversation
 * with a collector, creating it when needed (200 existing, 201 new). With a subject (stage R4) the
 * card (`subjectItemId`) or deck core (`subjectBinderId`) becomes what the chat is about: the
 * latest wins; "Message {handle}" on a profile sends none and keeps the chat's pinned card. A
 * refusal (403 `MESSAGING_BLOCKED`: a block, or the collector's messaging permission; 404 for a
 * card that is no longer listed) rejects with the `ApiError`, which the caller explains. The
 * answer seeds the thread's header.
 */
export function useStartConversation() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<ConversationSummary, ApiError, StartConversationRequest>({
    mutationFn: async (body) => required((await api.POST('/api/v1/conversations', { body })).data),
    onSuccess: (conversation) => {
      queryClient.setQueryData(meKeys.conversation(uid, conversation.id), conversation);
      void queryClient.invalidateQueries({ queryKey: meKeys.conversationList(uid) });
    },
  });
}

/**
 * One conversation, with its subject (`GET /api/v1/conversations/{id}`, stage R4): the inbox's
 * copy shows at once while it is read.
 */
export function useConversation(id: string | null | undefined) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  const queryClient = useQueryClient();
  return useQuery<ConversationSummary, ApiError>({
    queryKey: meKeys.conversation(uid, id ?? ''),
    queryFn: async () =>
      required(
        (await api.GET('/api/v1/conversations/{id}', { params: { path: { id: id ?? '' } } })).data
      ),
    initialData: () =>
      id
        ? (findConversation(
            queryClient.getQueryData<InboxData>(meKeys.conversationList(uid)),
            id
          ) ?? undefined)
        : undefined,
    // The inbox's copy is shown at once and the conversation read again behind it.
    initialDataUpdatedAt: 0,
    // Read again whenever the chat opens or the app comes back (review fix 1, F1): what it is
    // about may have changed while it was closed; pins pushed while it is open invalidate it.
    staleTime: 0,
    enabled: !!id && authenticated,
  });
}

/** `GET /api/v1/conversations/{id}/messages`: newest first, older pages by cursor. */
export function useMessages(id: string | null | undefined) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  return useInfiniteQuery<MessagePage, ApiError>({
    queryKey: meKeys.messages(uid, id ?? ''),
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/conversations/{id}/messages', {
            params: {
              path: { id: id ?? '' },
              query: {
                cursor: (pageParam as string | null) ?? undefined,
                limit: MESSAGES_PAGE_SIZE,
              },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    enabled: !!id && authenticated,
    // Realtime keeps it current; a reconnection or a return to the screen re-reads it.
    staleTime: 0,
  });
}

/** `POST /api/v1/uploads/images?kind=MESSAGE` (JPEG/PNG/WebP up to 8 MB, re-encoded). */
async function uploadMessagePhoto(draft: MessageDraft): Promise<string | undefined> {
  if (draft.attachment?.kind !== 'image') {
    return undefined;
  }
  const photo = draft.attachment.photo;
  const body = await imageFormData(
    { uri: photo.uri, mimeType: photo.mimeType, fileName: photo.fileName, file: photo.file },
    'photo'
  );
  const upload: ImageUploadResponse = required(
    (
      await api.POST('/api/v1/uploads/images', {
        params: { query: { kind: 'MESSAGE' } },
        // The contract types the multipart body as `{ file: binary }`; the FormData is sent as is.
        body: body as unknown as { file: string },
        bodySerializer: () => body,
      })
    ).data
  );
  return upload.uploadId;
}

/**
 * Sends a draft (text, a card or binder link, or a photo uploaded first through
 * `POST /uploads/images`) with `POST /api/v1/conversations/{id}/messages`. The stored message is
 * put at the top of the thread and its conversation at the top of the inbox; 403 / 413 / 415 /
 * 422 / 429 reject with the `ApiError` for the composer to explain.
 */
export function useSendMessage(id: string, selfId: string | null) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<MessageResponse, ApiError, MessageDraft>({
    mutationFn: async (draft) => {
      const imageUploadId = await uploadMessagePhoto(draft);
      return required(
        (
          await api.POST('/api/v1/conversations/{id}/messages', {
            params: { path: { id } },
            body: sendRequest(draft, imageUploadId),
          })
        ).data
      );
    },
    onSuccess: (message) => applyMessageToCaches(queryClient, uid, selfId, message),
  });
}

/**
 * `POST /api/v1/conversations/{id}/read`: the caller read up to this message (forward only). The
 * conversation's unread count is cleared at once and the notification badge re-read shortly
 * after (reading marks its MESSAGE notifications read on the server).
 */
export function useMarkConversationRead(id: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { lastReadMessageId: string }>({
    mutationFn: async ({ lastReadMessageId }) => {
      await api.POST('/api/v1/conversations/{id}/read', {
        params: { path: { id } },
        body: { lastReadMessageId },
      });
    },
    onMutate: () => patchEverywhere(queryClient, uid, id, { unreadCount: 0 }),
    onSuccess: () => refreshUnreadCountSoon(queryClient, uid),
  });
}

/**
 * Mute / archive (`PATCH /api/v1/conversations/{id}`): an archived conversation leaves the inbox
 * until a new message brings it back.
 */
export function useUpdateConversation() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<
    ConversationSummary,
    ApiError,
    { id: string; changes: UpdateConversationRequest }
  >({
    mutationFn: async ({ id, changes }) =>
      required(
        (
          await api.PATCH('/api/v1/conversations/{id}', {
            params: { path: { id } },
            body: changes,
          })
        ).data
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(meKeys.conversation(uid, updated.id), updated);
      queryClient.setQueryData<InboxData>(meKeys.conversationList(uid), (data) =>
        updated.archived ? removeConversation(data, updated.id) : upsertConversation(data, updated)
      );
    },
  });
}

/** Drops a conversation from the inbox (a block hides it both ways). */
export function removeFromInbox(queryClient: QueryClient, uid: Uid, id: string): void {
  queryClient.setQueryData<InboxData>(meKeys.conversationList(uid), (data) =>
    removeConversation(data, id)
  );
}

/** Puts a conversation back into the inbox (after an unblock). */
export function restoreToInbox(
  queryClient: QueryClient,
  uid: Uid,
  conversation: ConversationSummary
): void {
  queryClient.setQueryData<InboxData>(meKeys.conversationList(uid), (data) =>
    upsertConversation(data, conversation)
  );
}

/** Re-reads what a sale or its undo changed: the chat, its thread, the inbox and the inventory. */
async function refreshAfterSale(queryClient: QueryClient, uid: Uid, conversationId: string) {
  refreshBinderListings(queryClient, uid);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: meKeys.conversation(uid, conversationId) }),
    queryClient.invalidateQueries({ queryKey: meKeys.messages(uid, conversationId) }),
    queryClient.invalidateQueries({ queryKey: meKeys.conversationList(uid) }),
    queryClient.invalidateQueries({ queryKey: meKeys.ratingEligibilities(uid) }),
    refreshInventory(queryClient, uid),
  ]);
}

/**
 * Mark as sold (`POST /api/v1/conversations/{id}/sales`, stage R4): the seller marks the chat's
 * card or deck core sold to the other collector, with the copies sold and an optional tracking
 * number. 403 (not the seller), 409 `NOTHING_LEFT_TO_SELL` and 400 reject with the `ApiError`.
 */
export function useMarkSold(conversationId: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<SaleResponse, ApiError, MarkSoldRequest>({
    mutationFn: async (body) =>
      required(
        (
          await api.POST('/api/v1/conversations/{id}/sales', {
            params: { path: { id: conversationId } },
            body,
          })
        ).data
      ),
    onSuccess: async () => refreshAfterSale(queryClient, uid, conversationId),
  });
}

/**
 * The undo of a sale (`POST /api/v1/sales/{id}/undo`): the seller, within 10 minutes and before
 * anyone rated it. 409 `SALE_UNDO_CLOSED` / `SALE_ALREADY_RATED` reject with the `ApiError`.
 */
export function useUndoSale() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<SaleResponse, ApiError, { saleId: string; conversationId: string }>({
    mutationFn: async ({ saleId }) =>
      required(
        (await api.POST('/api/v1/sales/{id}/undo', { params: { path: { id: saleId } } })).data
      ),
    onSettled: async (_data, _error, { conversationId }) =>
      refreshAfterSale(queryClient, uid, conversationId),
  });
}
