import { Injector } from '@angular/core';
import { Router } from '@angular/router';
import { ListingsService, PublicListingOwner } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ChatDrawer } from '../../shared/messaging/chat-drawer.service';
import { ReportActionsService } from '../../shared/reports/report-actions.service';
import { IHaveIt } from '../../shared/wishlist/i-have-it.service';
import { WishlistActions } from '../../shared/wishlist/wishlist-actions.service';
import { SessionService } from '../auth/session.service';
import { ToastService } from '../feedback/toast.service';
import { toApiError } from '../http/api-error';
import { friendlyMessage } from '../http/api-error-messages';
import { silentErrors } from '../http/http-context';
import { GUEST_COPY, GuestAction, ownerQuery } from './guest-actions';

/**
 * Finishes what a guest tried to do, once signed in and back on their page (spec 14: "the
 * pending action resumes after sign-in"; the phone's R15 `PendingActionRunner.finish`): the chat
 * drawer with the card or deck core pinned ("Message"), the chat drawer with "Hi! I have {card}."
 * ("I have it"), the collector's profile, the wish dialog, Report collector. `GET
 * /listings/owner` names the collector; a listing gone in between, or the collector's own, says
 * so in a toast. Loaded on the first finished action only (out of the initial bundle).
 */
export async function finishGuestAction(
  action: GuestAction,
  injector: Injector,
  opener: HTMLElement | null,
): Promise<void> {
  const toasts = injector.get(ToastService);
  if (action.kind === 'wish') {
    await injector
      .get(WishlistActions)
      .add({ cardId: action.cardId, printingId: action.printingId, rarity: action.rarity });
    return;
  }
  const query = ownerQuery(action);
  if (!query) {
    return;
  }
  let owner: PublicListingOwner;
  try {
    owner = await firstValueFrom(
      injector
        .get(ListingsService)
        .getListingOwner(query, 'body', false, { context: silentErrors() }),
    );
  } catch (error) {
    const apiError = toApiError(error);
    toasts.show({
      title: apiError.status === 404 ? GUEST_COPY.gone : friendlyMessage(apiError),
      tone: 'error',
    });
    return;
  }
  const myId = injector.get(SessionService).me()?.id ?? null;
  const own = !!myId && owner.id === myId;
  const router = injector.get(Router);
  switch (action.kind) {
    case 'profile':
      await router.navigate(own ? ['/profile'] : ['/collectors', owner.handle]);
      return;
    case 'message': {
      if (own) {
        toasts.show({ title: GUEST_COPY.own });
        return;
      }
      const listing = action.listing;
      const subject =
        action.pin === false
          ? {}
          : 'itemId' in listing
            ? { subjectItemId: listing.itemId }
            : { subjectBinderId: listing.binderId };
      await injector.get(ChatDrawer).message({ recipientId: owner.id, ...subject }, opener);
      return;
    }
    case 'have':
      if (own) {
        toasts.show({ title: GUEST_COPY.own });
        return;
      }
      await injector.get(IHaveIt).offer(owner.id, action.card, opener);
      return;
    case 'report':
      if (own) {
        toasts.show({ title: GUEST_COPY.own });
        return;
      }
      await injector.get(ReportActionsService).report(
        {
          id: owner.id,
          displayName: owner.displayName,
          handle: owner.handle,
          avatarUrl: owner.avatarUrl ?? null,
        },
        { source: 'BINDER', binderId: action.binderId },
      );
      return;
  }
}
