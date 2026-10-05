import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { ConversationPage, ConversationSummary, MessagePage, MessageResponse } from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/** Messages per page of a thread (newest first). */
export const MESSAGES_PAGE_SIZE = 30;
/** Conversation pages scanned to find one opened by id (deep link) when it is not cached. */
const CONVERSATION_LOOKUP_PAGES = 3;
/** Longest text message (`SendMessageRequest.body`). */
export const MESSAGE_MAX_LENGTH = 4000;

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
      void queryClient.invalidateQueries({ queryKey: meKeys.conversations(uid), exact: true });
    },
  });
}

/**
 * One conversation (its other participant for the thread header): the summary cached when it was
 * opened, else looked up in the first pages of `GET /conversations`.
 */
export function useConversation(id: string | null | undefined) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
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
    // A thread is live: re-read when the screen comes back (no realtime on mobile yet).
    staleTime: 0,
  });
}

/**
 * `POST /api/v1/conversations/{id}/messages` with a text message. The stored message is put at
 * the top of the newest page (no refetch of the whole thread); 403 / 422 / 429 reject with the
 * `ApiError` for the composer to explain.
 */
export function useSendMessage(id: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<MessageResponse, ApiError, { body: string }>({
    mutationFn: async ({ body }) =>
      required(
        (
          await api.POST('/api/v1/conversations/{id}/messages', {
            params: { path: { id } },
            body: { kind: 'TEXT', body },
          })
        ).data
      ),
    onSuccess: (message) => {
      queryClient.setQueryData<InfiniteData<MessagePage>>(meKeys.messages(uid, id), (data) => {
        if (!data || data.pages.length === 0) {
          return data;
        }
        const [first, ...rest] = data.pages;
        const items = (first?.items ?? []).filter((item) => item.id !== message.id);
        return { ...data, pages: [{ ...first, items: [message, ...items] }, ...rest] };
      });
      void queryClient.invalidateQueries({ queryKey: meKeys.conversations(uid), exact: true });
    },
  });
}

/** `POST /api/v1/conversations/{id}/read`: the caller read up to this message (forward only). */
export function useMarkConversationRead(id: string) {
  return useMutation<void, ApiError, { lastReadMessageId: string }>({
    mutationFn: async ({ lastReadMessageId }) => {
      await api.POST('/api/v1/conversations/{id}/read', {
        params: { path: { id } },
        body: { lastReadMessageId },
      });
    },
  });
}
