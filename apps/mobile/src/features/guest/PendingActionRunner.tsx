import { useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAccount } from '@/src/account/AccountProvider';
import { useFlowLock } from '@/src/account/flowLock';
import type { Gate } from '@/src/account/gate';
import { useGuestAction, type GuestAction } from '@/src/account/guestAction';
import { isApiError } from '@/src/api/ApiError';
import { friendlyError } from '@/src/api/errorMessages';
import { fetchListingOwner } from '@/src/api/hooks/listings';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { useIHaveIt } from '@/src/features/collectors/useIHaveIt';
import { useMessageCollector } from '@/src/features/messages/useMessageCollector';
import { reportParams } from '@/src/features/reports/reportLabels';

import { GUEST_COPY } from './guestCopy';

/** Screens an action never finishes on: the auth screens, the account states, the welcome. */
const NOT_HERE = new Set(['(auth)', '(account)', 'onboarding']);

/**
 * Finishes what a guest tried to do once they have signed in or created their account and gone
 * through the welcome (stage R15): the chat opens with the card or deck core pinned ("Message"),
 * the chat with the text of "I have it", the collector's profile or cards, the wish form. The
 * phone is back on the guest's screen first (`useAuthGate`); the action opens on top of it.
 *
 * The action names its listing only (`useGuestAction`): `GET /listings/owner` names the collector.
 * A listing gone in between, or one of the collector's own, says so in a snackbar.
 */
export function PendingActionRunner({ gate }: { gate: Gate }) {
  const router = useRouter();
  const segments = useSegments();
  const snackbar = useSnackbar();
  const me = useAccount().me;
  const flowLocked = useFlowLock((store) => store.lockedBy !== null);
  const pending = useGuestAction((state) => state.pending);
  const { message } = useMessageCollector();
  const { haveIt } = useIHaveIt();
  const running = useRef(false);

  const root = segments[0] ?? '(tabs)';
  // The account is ready (`/me` read: whose listing it is), and the phone is on a screen.
  const here = gate === 'app' && !!me && !flowLocked && !NOT_HERE.has(root);
  // The latest flows, without re-running the effect when their identity changes.
  const flows = useRef({ message, haveIt, router, snackbar, myId: me?.id ?? null });
  useEffect(() => {
    flows.current = { message, haveIt, router, snackbar, myId: me?.id ?? null };
  });

  useEffect(() => {
    if (!here || !pending || running.current) {
      return;
    }
    const action = useGuestAction.getState().take();
    if (!action) {
      return;
    }
    running.current = true;
    void finish(action, flows.current).finally(() => {
      running.current = false;
    });
  }, [here, pending]);

  return null;
}

interface Flows {
  message: ReturnType<typeof useMessageCollector>['message'];
  haveIt: ReturnType<typeof useIHaveIt>['haveIt'];
  router: ReturnType<typeof useRouter>;
  snackbar: ReturnType<typeof useSnackbar>;
  myId: string | null;
}

/** Runs one action (exported for its tests). */
export async function finish(action: GuestAction, flows: Flows): Promise<void> {
  if (action.kind === 'wish') {
    flows.router.push({
      pathname: '/wishlist/new',
      params: {
        cardId: action.cardId,
        ...(action.printingId ? { printingId: action.printingId } : {}),
        ...(action.rarity ? { rarity: action.rarity } : {}),
      },
    });
    return;
  }
  const listing =
    action.kind === 'have'
      ? { wishId: action.wishId }
      : action.kind === 'report'
        ? { binderId: action.binderId }
        : action.listing;
  let owner;
  try {
    owner = await fetchListingOwner(listing);
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      flows.snackbar.show(GUEST_COPY.resume.gone);
    } else {
      const friendly = isApiError(error)
        ? friendlyError(error)
        : { title: 'Something went wrong', message: 'Please try again.' };
      flows.snackbar.show(`${friendly.title}. ${friendly.message}`, { tone: 'error' });
    }
    return;
  }
  const own = flows.myId !== null && owner.id === flows.myId;
  switch (action.kind) {
    case 'profile':
      if (own) {
        flows.router.navigate('/profile');
        return;
      }
      flows.router.push({
        pathname: action.page === 'cards' ? '/collectors/[id]/cards' : '/collectors/[id]',
        params: { id: owner.handle },
      });
      return;
    case 'message':
      if (own) {
        flows.snackbar.show(GUEST_COPY.resume.own);
        return;
      }
      await flows.message(owner.id, action.listing);
      return;
    case 'report':
      if (own) {
        flows.snackbar.show(GUEST_COPY.resume.own);
        return;
      }
      flows.router.push({
        pathname: '/report',
        params: reportParams(owner, { source: 'BINDER', binderId: action.binderId }),
      });
      return;
    case 'have':
      if (own) {
        flows.snackbar.show(GUEST_COPY.resume.own);
        return;
      }
      await flows.haveIt(
        owner.id,
        {
          cardId: action.card.cardId,
          cardName: action.card.cardName,
          printing: action.card.printing ?? null,
          rarity: action.card.rarity ?? null,
        },
        `resume-${action.wishId}`
      );
      return;
  }
}
