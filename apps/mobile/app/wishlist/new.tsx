import { useLocalSearchParams } from 'expo-router';

import { WishCardSearch } from '@/src/features/wishlist/WishCardSearch';
import { WishEditor } from '@/src/features/wishlist/WishEditor';

/**
 * "Add a wish" (stage R14): without a card, the card search (`?game=`, the browsed game: its
 * cards only, stage G); with `?cardId=`, the wish form (mockup v50 screen 64), from that search
 * (`?from=search`, with `?code=` the text typed) or from a card page (`?printingId=` when a
 * printing was picked there or `?rarity=` for any printing of one rarity).
 */
export default function NewWishScreen() {
  const { cardId, printingId, rarity, code, from, game } = useLocalSearchParams<{
    cardId?: string;
    game?: string;
    printingId?: string;
    rarity?: string;
    code?: string;
    from?: string;
  }>();
  if (!cardId) {
    return <WishCardSearch game={game || null} />;
  }
  return (
    <WishEditor
      key={cardId}
      mode="create"
      cardId={cardId}
      printingId={printingId || null}
      rarity={rarity || null}
      code={code || null}
      fromSearch={from === 'search'}
    />
  );
}
