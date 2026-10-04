import { EmptyState } from '@/src/components/ui/EmptyState';
import { Screen } from '@/src/components/ui/Screen';

/** Messages tab: private conversations with other collectors (mobile stage for Phase 5). */
export default function MessagesScreen() {
  return (
    <Screen testID="screen-messages">
      <EmptyState
        icon="message-text-outline"
        title="No conversations yet"
        description="Messaging arrives in a later version of the app. Meetup details always stay private between the two of you."
      />
    </Screen>
  );
}
