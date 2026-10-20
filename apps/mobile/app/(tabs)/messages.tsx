import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FEATURE, useFeature } from '@/src/api/hooks/featureFlags';
import { Segmented } from '@/src/components/ui/Segmented';
import { Text } from '@/src/components/ui/Text';
import { ChannelList } from '@/src/features/community/ChannelList';
import { INBOX_COPY } from '@/src/features/messages/chatCopy';
import { InboxView } from '@/src/features/messages/InboxView';
import { RealtimeStatus } from '@/src/features/messages/RealtimeStatus';
import { NotificationBell } from '@/src/features/notifications/NotificationBell';
import { fontFamily, fontWeight, spacing, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

type MessagesView = 'inbox' | 'community';

const VIEWS = [
  { value: 'inbox', label: INBOX_COPY.inbox },
  { value: 'community', label: INBOX_COPY.community },
] as const;

/**
 * Messages (owner spec 2026-10-14, section 10, mockup screen 22): the title "Messages" with the
 * bell (and the small "Live" status of the realtime channel, so a stale inbox is never a surprise),
 * then the inbox. The community channels keep today's "Inbox | Community" switch above the list
 * only while the `publicChat` flag is on; without it there is no switch. `?view=community` opens
 * the channels.
 */
export default function MessagesScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const community = useFeature(FEATURE.publicChat).enabled;
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
  const shown: MessagesView = community ? view : 'inbox';

  return (
    <View
      key={`text-size-${fontScale}`}
      testID="screen-messages"
      style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}
    >
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
            style={[styles.title, { color: palette.ink }]}
          >
            {INBOX_COPY.title}
          </Text>
          <View style={styles.actions}>
            <RealtimeStatus />
            <NotificationBell testID="notification-bell-messages" variant="round" />
          </View>
        </View>
        {community ? (
          <Segmented
            label={INBOX_COPY.viewLabel}
            options={VIEWS}
            value={view}
            onChange={change}
            testID="messages-view"
          />
        ) : null}
      </View>
      <View style={styles.fill}>
        {shown === 'inbox' ? <InboxView /> : <ChannelList onOpenInbox={() => change('inbox')} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[5],
    paddingBottom: spacing[2],
    gap: spacing[3],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.4,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
});
