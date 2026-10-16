import { Stack, useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';

import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';

/**
 * A screen that left the app and only sends its links on (stage R5: the public binders of a state,
 * the card holders list): the new place replaces it one turn after it is shown. Replaced in the
 * same turn, the web build's history entry still named the old route, and expo-router failed to
 * read the navigation state of a stack screen that was being replaced while it was pushed.
 */
export function DeferredRedirect({ href, testID }: { href: Href; testID: string }) {
  const router = useRouter();
  const target = JSON.stringify(href);
  useEffect(() => {
    const timer = setTimeout(() => router.replace(JSON.parse(target) as Href), 0);
    return () => clearTimeout(timer);
  }, [router, target]);
  return (
    <Screen safeBottom testID={testID}>
      <Stack.Screen options={{ title: '' }} />
      <SkeletonList rows={3} rowHeight={72} />
    </Screen>
  );
}
