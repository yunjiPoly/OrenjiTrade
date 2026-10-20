import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { isApiError } from '@/src/api/ApiError';
import { api, required } from '@/src/api/client';
import { friendlyError } from '@/src/api/errorMessages';
import { useStartConversation } from '@/src/api/hooks/messaging';
import { useUid } from '@/src/api/hooks/useUid';
import { meKeys } from '@/src/api/queryKeys';
import type { InventoryPage } from '@/src/api/types';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { ownCardChoice } from '@/src/features/messages/OwnCardPicker';
import { setPendingDraft } from '@/src/features/messages/pendingDraft';

import { PROFILE_COPY } from './profileCopy';
import { matchingItem, type WishTarget } from './profileRules';

/** Your copies of one card read at once (a collector holds a few rows of a card at most). */
const COPIES_PAGE = 50;

/**
 * "I have it" (owner spec 2026-10-14, section 10; on profiles since stage R6, on Home with R7):
 * opens or reuses your chat with the collector who wishes the card, with "I have {card} for your
 * wishlist. Interested?" in the message box. When your inventory holds the card (any printing; the
 * wished printing, then its rarity, then a public copy first), that copy becomes the chat's card
 * (R4's chat subject: `POST /conversations` with `subjectItemId`, you are the seller) and waits in
 * the message box to be shared before the text (R4's `CARD_LINK` with `inventoryItemId`). Nothing is
 * sent until you tap send. A refusal (a block, their messaging setting) is said in a snackbar.
 */
export function useIHaveIt() {
  const router = useRouter();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const uid = useUid();
  const start = useStartConversation();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const haveIt = useCallback(
    async (recipientId: string, wish: WishTarget, key: string) => {
      if (busyKey) {
        return;
      }
      setBusyKey(key);
      try {
        const filters = { cardId: wish.cardId, size: COPIES_PAGE, purpose: 'i-have-it' };
        const copies = await queryClient.fetchQuery<InventoryPage>({
          queryKey: meKeys.inventoryItems(uid, filters),
          queryFn: async () =>
            required(
              (
                await api.GET('/api/v1/inventory/items', {
                  params: { query: { cardId: wish.cardId, size: COPIES_PAGE, sort: 'updated' } },
                })
              ).data
            ),
          staleTime: 0,
        });
        const item = matchingItem(copies.items ?? [], wish);
        const conversation = await start.mutateAsync({
          recipientId,
          ...(item ? { subjectItemId: item.id } : {}),
        });
        setPendingDraft(conversation.id, {
          text: PROFILE_COPY.haveMessage(wish.cardName),
          attachment: item ? { kind: 'item', item: ownCardChoice(item) } : null,
        });
        router.push({ pathname: '/messages/[id]', params: { id: conversation.id } });
      } catch (error) {
        const friendly = isApiError(error) ? friendlyError(error) : PROFILE_COPY.somethingWrong;
        snackbar.show(`${friendly.title}. ${friendly.message}`, { tone: 'error' });
      } finally {
        setBusyKey(null);
      }
    },
    [busyKey, queryClient, router, snackbar, start, uid]
  );

  return { haveIt, busyKey };
}
