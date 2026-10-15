import type { QueryClient } from '@tanstack/react-query';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { restoreInventoryItem, restoreInventoryItems } from '@/src/api/hooks/inventory';
import type { Snackbar } from '@/src/components/ui/Snackbar';
import { isLimitReached, limitReachedInfo, limitReachedMessage } from '@/src/lib/limits';

import { TOAST_COPY } from './inventoryCopy';

interface Context {
  snackbar: Snackbar;
  queryClient: QueryClient;
  uid: string | null;
  /** The restored card stands out in Inventory (the orange ring). */
  markSaved: (id: string | null) => void;
}

/**
 * Why "Undo" did not bring the cards back: too late, a reached inventory limit (said as stage F1's
 * plain limit message: which limit and how much of it is used, never a plan), or the usual error.
 */
function undoFailed(snackbar: Snackbar, error: unknown) {
  const apiError = error as ApiError;
  snackbar.show(
    apiError.errorCode === 'RESTORE_WINDOW_CLOSED'
      ? TOAST_COPY.tooLate
      : isLimitReached(apiError)
        ? limitReachedMessage(limitReachedInfo(apiError))
        : friendlyMessage(apiError),
    { tone: 'error' }
  );
}

/**
 * "Card deleted · {card}" with "Undo" (owner spec 2026-10-14, section 6, screen 9): Undo brings the
 * card back with everything it had (`POST .../restore`, within 10 minutes) and says so.
 */
export function showCardDeleted(context: Context, id: string, name: string) {
  const { snackbar, queryClient, uid, markSaved } = context;
  snackbar.show(name, {
    title: TOAST_COPY.deleted,
    icon: 'deleted',
    action: {
      label: TOAST_COPY.undo,
      testID: 'snackbar-undo',
      onPress: () => {
        void restoreInventoryItem(queryClient, uid, id)
          .then((item) => {
            markSaved(item.id);
            snackbar.show(item.card.name, { title: TOAST_COPY.restored, icon: 'success' });
          })
          .catch((error: unknown) => undoFailed(snackbar, error));
      },
    },
  });
}

/** "{n} cards deleted" with "Undo" (the bulk delete of Select mode). */
export function showCardsDeleted(context: Context, ids: readonly string[]) {
  const { snackbar, queryClient, uid } = context;
  snackbar.show(TOAST_COPY.deletedMany(ids.length), {
    icon: 'deleted',
    action: {
      label: TOAST_COPY.undo,
      testID: 'snackbar-undo',
      onPress: () => {
        void restoreInventoryItems(queryClient, uid, ids)
          .then((restored) => snackbar.show(TOAST_COPY.restoredMany(restored), { icon: 'success' }))
          .catch((error: unknown) => undoFailed(snackbar, error));
      },
    },
  });
}
