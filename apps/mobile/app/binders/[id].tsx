import { Stack, useLocalSearchParams } from 'expo-router';

import { EmptyState } from '@/src/components/ui/EmptyState';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';

/** Deep-link target: https://www.orenjitrade.com/binders/<id> and orenjitrade://binders/<id>. */
export default function BinderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Binder' }} />
      <Screen scroll testID="screen-binder">
        <SkeletonList rows={3} rowHeight={64} />
        <EmptyState
          icon="book-open-page-variant-outline"
          title="Binder"
          description={`Cards, availability and freshness for binder ${id ?? '?'} arrive in Phase 3.`}
        />
      </Screen>
    </>
  );
}
