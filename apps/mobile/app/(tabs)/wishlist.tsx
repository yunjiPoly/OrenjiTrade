import { useRouter } from 'expo-router';

import { EmptyState } from '@/src/components/ui/EmptyState';
import { Screen } from '@/src/components/ui/Screen';

/** Wishlist tab: cards the collector is looking for, with nearby-match alerts (Phase 6). */
export default function WishlistScreen() {
  const router = useRouter();

  return (
    <Screen testID="screen-wishlist">
      <EmptyState
        icon="heart-outline"
        title="Your wishlist is empty"
        description="Save the cards you are hunting for and get notified when a collector nearby lists one."
        actionLabel="Find a card"
        onAction={() => router.push('/(tabs)/search')}
      />
    </Screen>
  );
}
