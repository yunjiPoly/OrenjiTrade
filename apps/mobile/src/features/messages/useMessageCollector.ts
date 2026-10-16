import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { isApiError } from '@/src/api/ApiError';
import { friendlyError } from '@/src/api/errorMessages';
import { useStartConversation } from '@/src/api/hooks/messaging';
import { useSnackbar } from '@/src/components/ui/Snackbar';

/** What a chat is about when it is opened from a listing (stage R4). */
export interface ChatSubjectRef {
  /** A card (inventory item). */
  itemId?: string;
  /** A deck core (binder). */
  binderId?: string;
}

/**
 * "Message" on a profile, a binder or a holder (the web's `ConversationStarterService`): opens
 * the conversation with a collector, creating it when needed (`POST /conversations`), then the
 * thread. From a deck core page (and, with stage R5, a holder row) the card or deck core becomes
 * the chat's pinned subject, the latest one winning; "Message {handle}" on a profile sends none
 * and keeps the chat's pinned card. A refusal (403 `MESSAGING_BLOCKED`: a block, or the
 * collector's messaging permission; 404 for a card no longer listed) is explained in a snackbar.
 */
export function useMessageCollector(beforeNavigate?: () => void) {
  const router = useRouter();
  const snackbar = useSnackbar();
  const start = useStartConversation();

  const message = useCallback(
    async (recipientId: string, subject?: ChatSubjectRef) => {
      try {
        const conversation = await start.mutateAsync({
          recipientId,
          ...(subject?.itemId ? { subjectItemId: subject.itemId } : {}),
          ...(subject?.binderId ? { subjectBinderId: subject.binderId } : {}),
        });
        beforeNavigate?.();
        router.push({ pathname: '/messages/[id]', params: { id: conversation.id } });
      } catch (error) {
        const friendly = isApiError(error)
          ? friendlyError(error)
          : { title: 'Something went wrong', message: 'Please try again.' };
        snackbar.show(`${friendly.title}. ${friendly.message}`, { tone: 'error' });
      }
    },
    [beforeNavigate, router, snackbar, start]
  );

  return {
    message,
    /** Recipient id of the conversation being opened (progress on the button). */
    startingId: start.isPending ? (start.variables?.recipientId ?? null) : null,
  };
}
