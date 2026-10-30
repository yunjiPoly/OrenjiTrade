import { Injectable, inject } from '@angular/core';
import {
  BindersService,
  InventoryItemResponse,
  InventoryItemResponseVisibilityEnum,
  InventoryService,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { silentErrors } from '../../core/http/http-context';
import { ChatDrawer } from '../messaging/chat-drawer.service';

/** The wish "I have it" answers: its card, and the printing or rarity it asks for. */
export interface WishedCard {
  cardId: string;
  name: string;
  printingId?: string | null;
  rarity?: string | null;
}

/** "Hi! I have {card}." (spec 5.2): waits in the message box, never sent by itself. */
export function iHaveItDraft(cardName: string): string {
  return `Hi! I have ${cardName}.`;
}

/** "I have Ash Blossom & Joyous Spring. Message theo.duels" (the button's name). */
export function iHaveItLabel(cardName: string, handle: string | null | undefined): string {
  return handle ? `I have ${cardName}. Message ${handle}` : `I have ${cardName}`;
}

/**
 * The copy "I have it" pins as the chat's card: one of the collector's copies of the wished card
 * that is public right now and not filed in a deck core (it sells only with its core): the wished
 * printing first, then the wished rarity, then any printing; the newest of them. A private copy is
 * never pinned (the phone's R6 review fix 1: the other collector's inbox would show it).
 */
export function pickPublicCopy(
  copies: readonly InventoryItemResponse[],
  wish: WishedCard,
  coreBinderIds: ReadonlySet<string>,
): InventoryItemResponse | null {
  const candidates = copies.filter(
    (item) =>
      item.effectivePublic &&
      item.visibility !== InventoryItemResponseVisibilityEnum.Private &&
      !(item.binder && coreBinderIds.has(item.binder.id)),
  );
  const rank = (item: InventoryItemResponse): number => {
    if (wish.printingId && item.printing.id === wish.printingId) {
      return 0;
    }
    if (wish.rarity && item.printing.rarity === wish.rarity) {
      return 1;
    }
    return 2;
  };
  return (
    [...candidates].sort(
      (a, b) => rank(a) - rank(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )[0] ?? null
  );
}

/**
 * "I have it" on another collector's wish (Home's Wanted posts, a profile's Looking for; spec 5.2
 * and 11): opens the chat drawer to the wisher with "Hi! I have {card}." waiting in the message
 * box; when one of your copies of that card is public, it is the chat's card. Nothing is sent
 * until you send it. Signed out, the chat drawer asks to sign in.
 */
@Injectable({ providedIn: 'root' })
export class IHaveIt {
  private readonly auth = inject(AuthService);
  private readonly inventory = inject(InventoryService);
  private readonly binders = inject(BindersService);
  private readonly drawer = inject(ChatDrawer);

  async offer(wisherId: string, wish: WishedCard, opener?: EventTarget | null): Promise<void> {
    const copy = this.auth.isAuthenticated() ? await this.findCopy(wish) : null;
    await this.drawer.message(
      {
        recipientId: wisherId,
        ...(copy ? { subjectItemId: copy.id } : {}),
        draft: iHaveItDraft(wish.name),
      },
      opener,
    );
  }

  /** Your public copy of the card, or `null` (also when your inventory could not be read). */
  private async findCopy(wish: WishedCard): Promise<InventoryItemResponse | null> {
    try {
      const [page, binders] = await Promise.all([
        firstValueFrom(
          this.inventory.listInventoryItems({ cardId: wish.cardId, size: 50 }, 'body', false, {
            context: silentErrors(),
          }),
        ),
        firstValueFrom(this.binders.listMyBinders('body', false, { context: silentErrors() })),
      ]);
      const cores = new Set((binders ?? []).filter((b) => b.sellsAsCore).map((b) => b.id));
      return pickPublicCopy(page.items ?? [], wish, cores);
    } catch {
      return null;
    }
  }
}
