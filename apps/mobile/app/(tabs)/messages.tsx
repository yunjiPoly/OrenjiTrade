import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/src/components/ui/Screen';
import { Segmented } from '@/src/components/ui/Segmented';
import { ChannelList } from '@/src/features/community/ChannelList';
import { InboxView } from '@/src/features/messages/InboxView';
import { RealtimeStatus } from '@/src/features/messages/RealtimeStatus';
import { spacing } from '@/src/theme';

type MessagesView = 'inbox' | 'community';

const VIEWS = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'community', label: 'Community' },
] as const;

/**
 * Messages tab (the web's `/messages` and, as on the web's mobile navigation, `/community`): the
 * private inbox (live over realtime, unread counts, last message previews) and the public
 * community channels, side by side in a segmented control. `?view=community` opens the channels.
 */
export default function MessagesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<MessagesView>(
    params.view === 'community' ? 'community' : 'inbox'
  );
  // A link into the tab (`?view=community`) switches the view once per new parameter.
  const [linkedView, setLinkedView] = useState(params.view);
  if (params.view !== linkedView) {
    setLinkedView(params.view);
    if (params.view === 'community' || params.view === 'inbox') {
      setView(params.view);
    }
  }

  const change = (next: MessagesView) => {
    setView(next);
    router.setParams({ view: next });
  };

  return (
    <Screen edgeToEdge testID="screen-messages">
      <View style={styles.bar}>
        <Segmented
          label="Messages view"
          options={VIEWS}
          value={view}
          onChange={change}
          style={styles.segmented}
          testID="messages-view"
        />
        <RealtimeStatus />
      </View>
      <View style={styles.fill}>
        {view === 'inbox' ? <InboxView /> : <ChannelList onOpenInbox={() => change('inbox')} />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  segmented: { flex: 1 },
});
