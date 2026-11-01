import { useLocalSearchParams, useRouter } from 'expo-router';

import { useWishlist } from '@/src/api/hooks/wishlist';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { WISH_COPY as COPY } from '@/src/features/wishlist/wishCopy';
import { WishEditor } from '@/src/features/wishlist/WishEditor';

/**
 * Edit a wish (`/wishlist/edit?id=`, mockup v50 screen 65): which copy, Near Mint only, the price,
 * the public note, "Save changes" and "Remove from wishlist".
 */
export default function EditWishScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const wishlist = useWishlist();
  const item = wishlist.data?.find((candidate) => candidate.id === id) ?? null;

  if (item) {
    return <WishEditor key={item.id} mode="edit" item={item} />;
  }
  const back = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace({ pathname: '/search', params: { segment: 'wishlist' } });
    }
  };
  let content;
  if (wishlist.data || !id) {
    content = (
      <EmptyState
        testID="wish-not-found"
        icon="heart-off-outline"
        title={COPY.notFoundTitle}
        description={COPY.notFoundBody}
        actionLabel={COPY.backToWishlist}
        onAction={() => router.navigate({ pathname: '/search', params: { segment: 'wishlist' } })}
      />
    );
  } else if (wishlist.error) {
    content = (
      <ErrorState
        testID="wish-edit-error"
        error={wishlist.error}
        title={COPY.loadError}
        onRetry={() => void wishlist.refetch()}
      />
    );
  } else {
    content = <SkeletonList rows={4} rowHeight={64} testID="wish-edit-loading" />;
  }
  return (
    <SettingsPage title={COPY.editTitle} onBack={back} testID="screen-wish-edit">
      {content}
    </SettingsPage>
  );
}
