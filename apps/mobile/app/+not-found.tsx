import { Stack, useRouter } from 'expo-router';

import { EmptyState } from '@/src/components/ui/EmptyState';
import { Screen } from '@/src/components/ui/Screen';

export default function NotFoundScreen() {
  const router = useRouter();

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
