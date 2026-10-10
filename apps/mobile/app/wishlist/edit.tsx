import { useLocalSearchParams, useRouter } from 'expo-router';

import { useWishlist } from '@/src/api/hooks/wishlist';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { WishEditor } from '@/src/features/wishlist/WishEditor';

/** Edit a wish (`/wishlist/edit?id=`): which copy, the public note, Near Mint only, the term. */
export default function EditWishScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const wishlist = useWishlist();
  const item = wishlist.data?.find((candidate) => candidate.id === id) ?? null;

  let content;
  if (item) {
    content = <WishEditor key={item.id} mode="edit" item={item} />;
  } else if (wishlist.data || !id) {
    content = (
      <EmptyState
        testID="wish-not-found"
        icon="heart-off-outline"
        title="This wish no longer exists"
        description="It may have been removed."
        actionLabel="Back to your wishlist"
        onAction={() => router.navigate('/wishlist')}
      />
    );
  } else if (wishlist.error) {
    content = (
      <ErrorState
        testID="wish-edit-error"
        error={wishlist.error}
        title="Your wishlist could not load"
        onRetry={() => void wishlist.refetch()}
      />
    );
  } else {
    content = <SkeletonList rows={4} rowHeight={64} testID="wish-edit-loading" />;
  }

  return (
    <Screen scroll safeBottom testID="screen-wish-edit">
      {content}
    </Screen>
  );
}
