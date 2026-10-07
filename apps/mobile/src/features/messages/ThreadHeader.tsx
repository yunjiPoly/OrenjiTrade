import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ConversationSummary } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { ListRow } from '@/src/components/ui/Layout';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

export type ThreadMenuAction =
  'mute' | 'unmute' | 'archive' | 'block' | 'unblock' | 'report' | 'rate';

/** The status line under the other collector's name (web: `ThreadHeaderComponent.status`). */
export function threadStatus(
  conversation: ConversationSummary,
  typing: boolean,
  blocked: boolean
): string {
  if (blocked) {
    return 'Blocked';
  }
  if (typing) {
    return 'typing…';
  }
  return conversation.other.onlineStatus === 'ONLINE'
    ? 'Online now'
    : `@${conversation.other.handle}`;
}

/**
 * The conversation options button, shown in the navigation header (`headerRight`): the top-right
 * corner under the header is where Expo Go 57 floated its tools button, so no control goes there.
 * Expo Go 58 floats it over the header's right end instead (drag it away or turn it off in its
 * developer menu; the Maestro flows turn it off).
 */
export function ThreadMenuButton({ name, onPress }: { name: string; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Conversation options for ${name}`}
      onPress={onPress}
      hitSlop={8}
      testID="conversation-menu"
      style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name="dots-vertical" size={24} color={palette.ink} />
    </Pressable>
  );
}

/**
 * Thread header (the web's `app-thread-header`): the other collector (avatar, online dot,
 * "typing…", link to their profile) and the conversation options in a bottom sheet (opened by
 * {@link ThreadMenuButton}): mute, archive, rate them (when an interaction can still be rated),
 * block / unblock and report the collector.
 */
export function ThreadHeader({
  conversation,
  typing,
  blocked,
  canRate = false,
  menuOpen,
  onCloseMenu,
  onProfile,
  onAction,
}: {
  conversation: ConversationSummary;
  typing: boolean;
  blocked: boolean;
  /** An interaction with the other collector can still be rated ("Rate …"). */
  canRate?: boolean;
  menuOpen: boolean;
  onCloseMenu: () => void;
  onProfile: () => void;
  onAction: (action: ThreadMenuAction) => void;
}) {
  const { palette } = useTheme();
  const other = conversation.other;
  return (
    <View
      style={[styles.head, { borderBottomColor: palette.border, backgroundColor: palette.surface }]}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`View the profile of ${other.displayName}`}
        onPress={onProfile}
        testID="conversation-profile"
        style={({ pressed }) => [styles.who, pressed && styles.pressed]}
      >
        <View>
          <Avatar src={other.avatarUrl} name={other.displayName} size={36} />
          {other.onlineStatus === 'ONLINE' ? (
            <View
              testID="conversation-online"
              style={[
                styles.online,
                { backgroundColor: palette.online.online, borderColor: palette.surface },
              ]}
            />
          ) : null}
        </View>
        <View style={styles.grow}>
          <Text numberOfLines={1} style={[textStyle('md'), styles.strong, { color: palette.ink }]}>
            {other.displayName}
          </Text>
          <Text
            testID="conversation-status"
            style={[textStyle('xs'), { color: typing ? palette.primary : palette.textMuted }]}
          >
            {threadStatus(conversation, typing, blocked)}
            {conversation.muted ? ' · Muted' : ''}
          </Text>
        </View>
      </Pressable>
      <BottomSheet
        visible={menuOpen}
        onClose={onCloseMenu}
        title={other.displayName}
        testID="conversation-menu-sheet"
      >
        {conversation.muted ? (
          <ListRow
            icon="bell-ring-outline"
            label="Unmute"
            kind="button"
            onPress={() => onAction('unmute')}
            testID="conversation-unmute"
          />
        ) : (
          <ListRow
            icon="bell-off-outline"
            label="Mute"
            detail="No notifications for this conversation"
            kind="button"
            onPress={() => onAction('mute')}
            testID="conversation-mute"
          />
        )}
        <ListRow
          icon="archive-outline"
          label="Archive"
          detail="A new message brings it back"
          kind="button"
          onPress={() => onAction('archive')}
          testID="conversation-archive"
        />
        {canRate ? (
          <ListRow
            icon="star-outline"
            label={`Rate ${other.displayName}`}
            kind="button"
            onPress={() => onAction('rate')}
            testID="conversation-rate"
          />
        ) : null}
        {blocked ? (
          <ListRow
            icon="lock-open-variant-outline"
            label={`Unblock ${other.displayName}`}
            kind="button"
            onPress={() => onAction('unblock')}
            testID="conversation-unblock"
          />
        ) : (
          <ListRow
            icon="cancel"
            label={`Block ${other.displayName}`}
            kind="button"
            tone="danger"
            onPress={() => onAction('block')}
            testID="conversation-block"
          />
        )}
        <ListRow
          icon="flag-outline"
          label="Report collector"
          kind="button"
          tone="danger"
          onPress={() => onAction('report')}
          testID="conversation-report"
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  online: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  menuButton: { paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  pressed: { opacity: 0.8 },
});
