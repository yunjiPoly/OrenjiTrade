import { useRouter } from 'expo-router';

import { EmptyState } from '@/src/components/ui/EmptyState';
import { Screen } from '@/src/components/ui/Screen';

/** Messages tab: private conversations with other collectors (Phase 5). */
export default function MessagesScreen() {
  const router = useRouter();

  return (
    <Screen testID="screen-messages">
      <EmptyState
        icon="message-text-outline"
        title="No conversations yet"
        description="Message a collector from their profile to arrange a trade. Meetup details stay private between the two of you."
        actionLabel="Sign in"
        onAction={() => router.push('/(auth)/sign-in')}
      />
    </Screen>
  );
}
