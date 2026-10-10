import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/src/components/ui/Screen';
import { WishEditor } from '@/src/features/wishlist/WishEditor';

/**
 * "Add to wishlist" (web: the wishlist dialog): from the Wishlist tab (card autocomplete first)
 * or a card page (`?cardId=`, with `?printingId=` when a printing was picked there or `?rarity=`
 * for any printing of one rarity).
 */
export default function NewWishScreen() {
  const { cardId, printingId, rarity } = useLocalSearchParams<{
    cardId?: string;
    printingId?: string;
    rarity?: string;
  }>();
  return (
    <Screen scroll safeBottom testID="screen-wish-new">
      <WishEditor
        mode="create"
        cardId={cardId || null}
        printingId={printingId || null}
        rarity={rarity || null}
      />
    </Screen>
  );
}
