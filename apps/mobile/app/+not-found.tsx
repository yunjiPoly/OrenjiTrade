import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { EmptyState } from '@/src/components/ui/EmptyState';
import { Screen } from '@/src/components/ui/Screen';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { removedRouteTarget } from '@/src/navigation/removedRoutes';

/**
 * Unknown links. A link to a screen that left the phone (offers, trades, protected payments,
 * disputes; ADR 0018) is sent on to Messages or Settings with a short note instead.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  const snackbar = useSnackbar();
  const pathname = usePathname();
  const moved = removedRouteTarget(pathname);
  const href = moved?.href ?? null;
  const note = moved?.note ?? null;

  useEffect(() => {
    if (href && note) {
      router.replace(href);
      snackbar.show(note, { duration: 6000 });
    }
  }, [href, note, router, snackbar]);

  if (moved) {
    return (
      <>
        <Stack.Screen options={{ title: 'OrenjiTrade' }} />
        <Screen testID="screen-moved">
          <Skeleton width="60%" height={20} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Screen testID="screen-not-found">
        <EmptyState
          icon="map-marker-question-outline"
          title="This page does not exist"
          description="The link may be outdated or the content has been removed."
          actionLabel="Back to the map"
          onAction={() => router.replace('/(tabs)')}
        />
      </Screen>
    </>
  );
}
