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
  MessagePage,
  MessageResponse,
  UpdateConversationRequest,
} from '../types';
import { refreshUnreadCountSoon } from './notificationCentre';
import { useIsAuthenticated, useUid } from './useUid';

/** Messages per page of a thread (newest first). */
export const MESSAGES_PAGE_SIZE = 30;
/** Conversations per page of the inbox. */
export const CONVERSATIONS_PAGE_SIZE = 30;
/** Conversation pages scanned to find one opened by id (deep link) when it is not cached. */
const CONVERSATION_LOOKUP_PAGES = 3;

export { MESSAGE_MAX_LENGTH } from '@/src/features/messages/messageText';

type Uid = string | null;

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
  const onScreen = activeConversationId() === message.conversationId;
  const inbox = queryClient.getQueryData<InboxData>(meKeys.conversationList(uid));
  const result = applyMessageToInbox(inbox, message, selfId, onScreen);
  if (result.found) {
    queryClient.setQueryData(meKeys.conversationList(uid), result.data);
    const updated = findConversation(result.data, message.conversationId);
    if (updated) {
      queryClient.setQueryData(meKeys.conversation(uid, updated.id), updated);
    }
  } else {
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
 * with a collector, creating it when needed (200 existing, 201 new). A refusal (403
 * `MESSAGING_BLOCKED`: a block, or the collector's messaging permission) rejects with the
 * `ApiError`, which the caller explains. The answer seeds the thread's header.
 */
export function useStartConversation() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<ConversationSummary, ApiError, { recipientId: string }>({
    mutationFn: async ({ recipientId }) =>
      required((await api.POST('/api/v1/conversations', { body: { recipientId } })).data),
    onSuccess: (conversation) => {
      queryClient.setQueryData(meKeys.conversation(uid, conversation.id), conversation);
      void queryClient.invalidateQueries({ queryKey: meKeys.conversationList(uid) });
    },
  });
}

/**
 * One conversation (its other participant for the thread header): the inbox's copy when it is
 * loaded, the summary cached when it was opened, else looked up in the first pages of
 * `GET /conversations`.
 */
export function useConversation(id: string | null | undefined) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  const queryClient = useQueryClient();
  return useQuery<ConversationSummary, ApiError>({
    queryKey: meKeys.conversation(uid, id ?? ''),
    queryFn: async () => {
      let cursor: string | undefined;
      for (let page = 0; page < CONVERSATION_LOOKUP_PAGES; page++) {
        const slice: ConversationPage = required(
          (await api.GET('/api/v1/conversations', { params: { query: { cursor, limit: 50 } } }))
            .data
        );
        const found = slice.items?.find((conversation) => conversation.id === id);
        if (found) {
          return found;
        }
        if (!slice.hasMore || !slice.nextCursor) {
          break;
        }
        cursor = slice.nextCursor;
      }
      throw new ApiError({
        status: 404,
        errorCode: 'NOT_FOUND',
        message: 'This conversation is not available.',
      });
    },
    initialData: () =>
      id
        ? (findConversation(
            queryClient.getQueryData<InboxData>(meKeys.conversationList(uid)),
            id
          ) ?? undefined)
        : undefined,
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
