import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ConversationSummary } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { ListRow } from '@/src/components/ui/Layout';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, PINNED_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { CHAT_COPY } from './chatCopy';
import { chatStatusLine } from './dealRules';

export type ThreadMenuAction =
  'mute' | 'unmute' | 'archive' | 'block' | 'unblock' | 'report' | 'rate';

/**
 * The status line under the other collector's handle (mockup screen 23): "Online · {province}" or
 * "{province}", "typing…" while they type, "Blocked" once blocked; never a city (ADR 0017).
 */
export function threadStatus(
  conversation: ConversationSummary,
  typing: boolean,
  blocked: boolean
): string {
  return chatStatusLine(conversation, typing, blocked);
}

/**
 * The chat's top bar (owner spec 2026-10-14, section 10, mockup screens 23 and 24): back; the other
 * collector's avatar with the online dot, handle and status line, which open their profile; "⋯",
 * whose sheet holds "Rate {handle}" (while an interaction can still be rated), Mute, Archive,
 * "Report {handle}" and "Block {handle}" in red (or Unblock).
 */
export function ThreadHeader({
  conversation,
  typing,
  blocked,
  canRate = false,
  menuOpen,
  topInset,
  onBack,
  onOpenMenu,
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
  /** The status bar's height: the bar draws below it. */
  topInset: number;
  onBack: () => void;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onProfile: () => void;
  onAction: (action: ThreadMenuAction) => void;
}) {
  const { palette } = useTheme();
  const other = conversation.other;
  const status = threadStatus(conversation, typing, blocked);
  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: topInset + 8,
          borderBottomColor: palette.border,
          backgroundColor: palette.background,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={CHAT_COPY.back}
        onPress={onBack}
        // The id of the navigation header's back button: the flows go back the same way.
        testID="BackButton"
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color={palette.ink} />
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={CHAT_COPY.profile(other.handle)}
        accessibilityHint={status || undefined}
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
                { backgroundColor: palette.online.online, borderColor: palette.background },
              ]}
            />
          ) : null}
        </View>
        <View style={styles.grow}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.handle, { color: palette.ink }]}
          >
            {other.handle}
          </Text>
          {status ? (
            <Text
              testID="conversation-status"
              numberOfLines={1}
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              style={[styles.status, { color: typing ? palette.primary : palette.textMuted }]}
            >
              {status}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={CHAT_COPY.more(other.handle)}
        onPress={onOpenMenu}
        testID="conversation-menu"
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="dots-horizontal" size={24} color={palette.ink} />
      </Pressable>
      <BottomSheet visible={menuOpen} onClose={onCloseMenu} testID="conversation-menu-sheet">
        {canRate ? (
          <ListRow
            icon="star-outline"
            label={CHAT_COPY.rate(other.handle)}
            kind="button"
            onPress={() => onAction('rate')}
            testID="conversation-rate"
          />
        ) : null}
        {conversation.muted ? (
          <ListRow
            icon="bell-ring-outline"
            label={CHAT_COPY.unmute}
            kind="button"
            onPress={() => onAction('unmute')}
            testID="conversation-unmute"
          />
        ) : (
          <ListRow
            icon="bell-off-outline"
            label={CHAT_COPY.mute}
            detail={CHAT_COPY.muteDetail}
            kind="button"
            onPress={() => onAction('mute')}
            testID="conversation-mute"
          />
        )}
        <ListRow
          icon="archive-outline"
          label={CHAT_COPY.archive}
          detail={CHAT_COPY.archiveDetail}
          kind="button"
          onPress={() => onAction('archive')}
          testID="conversation-archive"
        />
        <ListRow
          icon="flag-outline"
          label={CHAT_COPY.report(other.handle)}
          kind="button"
          onPress={() => onAction('report')}
          testID="conversation-report"
        />
        {blocked ? (
          <ListRow
            icon="lock-open-variant-outline"
            label={CHAT_COPY.unblock(other.handle)}
            kind="button"
            onPress={() => onAction('unblock')}
            testID="conversation-unblock"
          />
        ) : (
          <ListRow
            icon="cancel"
            label={CHAT_COPY.block(other.handle)}
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
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingRight: 4,
    paddingLeft: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  online: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
  },
  grow: { flex: 1, minWidth: 0, gap: 1 },
  handle: { fontSize: 16, lineHeight: 21, fontWeight: fontWeight.semibold },
  status: { fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.7 },
});
