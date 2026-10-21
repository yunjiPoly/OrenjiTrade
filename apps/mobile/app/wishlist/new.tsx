import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/src/components/ui/Screen';
import { WishEditor } from '@/src/features/wishlist/WishEditor';

/**
 * "Add to wishlist" (web: the wishlist dialog): from Search › Wishlist (card autocomplete first,
 * `?game=` the browsed game: its cards only, stage G) or a card page (`?cardId=`, with
 * `?printingId=` when a printing was picked there or `?rarity=` for any printing of one rarity).
 */
export default function NewWishScreen() {
  const { cardId, printingId, rarity, game } = useLocalSearchParams<{
    cardId?: string;
    printingId?: string;
    rarity?: string;
    game?: string;
  }>();
  return (
    <Screen scroll safeBottom testID="screen-wish-new">
      <WishEditor
        mode="create"
        cardId={cardId || null}
        printingId={printingId || null}
        rarity={rarity || null}
        game={game || null}
      />
    </Screen>
  );
}
