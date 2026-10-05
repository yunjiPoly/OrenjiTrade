import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { isApiError } from '@/src/api/ApiError';
import { friendlyError } from '@/src/api/errorMessages';
import { useStartConversation } from '@/src/api/hooks/messaging';
import { useSnackbar } from '@/src/components/ui/Snackbar';

/**
 * "Message" on the map preview and on a profile (the web's `ConversationStarterService`): opens
 * the conversation with a collector, creating it when needed (`POST /conversations`), then the
 * thread. A refusal (403 `MESSAGING_BLOCKED`: a block, or the collector's messaging permission)
 * is explained in a snackbar.
 */
export function useMessageCollector(beforeNavigate?: () => void) {
  const router = useRouter();
  const snackbar = useSnackbar();
  const start = useStartConversation();

  const message = useCallback(
    async (recipientId: string) => {
      try {
        const conversation = await start.mutateAsync({ recipientId });
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
