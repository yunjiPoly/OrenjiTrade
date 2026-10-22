import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FEATURE, useFeature } from '@/src/api/hooks/featureFlags';
import { useConversations } from '@/src/api/hooks/messaging';
import { Text } from '@/src/components/ui/Text';
import { UnderlineTabs } from '@/src/components/ui/UnderlineTabs';
import { RoomList } from '@/src/features/community/RoomList';
import { INBOX_COPY } from '@/src/features/messages/chatCopy';
import { inboxConversations } from '@/src/features/messages/conversationCache';
import { InboxView } from '@/src/features/messages/InboxView';
import { totalUnread } from '@/src/features/messages/messageText';
import { RealtimeStatus } from '@/src/features/messages/RealtimeStatus';
import { NotificationBell } from '@/src/features/notifications/NotificationBell';
import { fontFamily, fontWeight, spacing, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

type MessagesView = 'inbox' | 'community';

/** `?view=chats` (and the older `inbox`) opens Chats, `?view=community` the rooms. */
function viewOf(param: string | undefined): MessagesView | null {
  if (param === 'community') {
    return 'community';
  }
  return param === 'chats' || param === 'inbox' ? 'inbox' : null;
}

/**
 * Messages (owner spec 2026-10-14, section 10, mockup screen 22; stage R11): the title "Messages"
 * with the bell (and the small "Live" status of the realtime channel, so a stale inbox is never a
 * surprise), then two tabs, Chats and Community, while the `publicChat` flag is on (without it, the
 * chats alone). Chats carries an orange dot while a chat is unread ("Chats, {n} unread"); the tab
 * bar's badge counts chats only. `?view=community` opens the rooms, `?view=chats` the chats.
 */
export default function MessagesScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const community = useFeature(FEATURE.publicChat).enabled;
  // A passive reader of the inbox the tab bar (and the Chats list) keeps fresh: it never asks the
  // server itself, so it never asks again for a list that just failed.
  const inbox = useConversations(false);
  const unread = useMemo(() => totalUnread(inboxConversations(inbox.data)), [inbox.data]);
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<MessagesView>(viewOf(params.view) ?? 'inbox');
  // A link into the tab (`?view=community`) switches the view once per new parameter.
  const [linkedView, setLinkedView] = useState(params.view);
  if (params.view !== linkedView) {
    setLinkedView(params.view);
    const linked = viewOf(params.view);
    if (linked) {
      setView(linked);
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
          <UnderlineTabs
            label={INBOX_COPY.viewLabel}
            tabs={[
              {
                value: 'inbox',
                label: INBOX_COPY.chats,
                dot: unread > 0,
                spokenLabel: unread > 0 ? INBOX_COPY.chatsUnread(unread) : INBOX_COPY.chats,
              },
              { value: 'community', label: INBOX_COPY.community },
            ]}
            value={view}
            onChange={change}
            testID="messages-view"
          />
        ) : null}
      </View>
      <View style={styles.fill}>
        {shown === 'inbox' ? <InboxView /> : <RoomList onOpenChats={() => change('inbox')} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[5],
    gap: spacing[2],
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
