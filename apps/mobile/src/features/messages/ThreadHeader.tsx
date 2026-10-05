import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ConversationSummary } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { ListRow } from '@/src/components/ui/Layout';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

export type ThreadMenuAction = 'mute' | 'unmute' | 'archive' | 'block' | 'unblock';

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
 * Thread header (the web's `app-thread-header`): the other collector (avatar, online dot,
 * "typing…", link to their profile) and the conversation options in a bottom sheet: mute,
 * archive, block / unblock. Reporting a collector arrives with the mobile Phase 7 stage.
 */
export function ThreadHeader({
  conversation,
  typing,
  blocked,
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  onProfile,
  onAction,
}: {
  conversation: ConversationSummary;
  typing: boolean;
  blocked: boolean;
  menuOpen: boolean;
  onOpenMenu: () => void;
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Conversation options for ${other.displayName}`}
        onPress={onOpenMenu}
        hitSlop={8}
        testID="conversation-menu"
        style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="dots-vertical" size={24} color={palette.ink} />
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
  menuButton: { padding: spacing[1] },
  pressed: { opacity: 0.8 },
});
