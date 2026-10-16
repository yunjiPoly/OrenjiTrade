import { useMemo, type ReactNode } from 'react';
import { FlatList, Platform, StyleSheet, View } from 'react-native';

import type { ConversationParticipant, MessageResponse } from '@/src/api/types';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, spacing, useTheme } from '@/src/theme';

import { CHAT_COPY } from './chatCopy';
import { MessageBubble, timeLabel } from './MessageBubble';
import { buildThreadItems, type ThreadItem } from './threadItems';

export interface ThreadMessageListProps {
  /** Oldest first. */
  messages: readonly MessageResponse[];
  other: ConversationParticipant;
  selfId: string | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  olderFailed: boolean;
  typing: boolean;
  onLoadOlder: () => void;
  /** "Rate {other}" of a sale message. */
  onRate: () => void;
  /** Shown at the very start of the conversation, once its first page is loaded (the safety tip). */
  start?: ReactNode;
}

/**
 * The message history (mockup screens 23 and 24): day separators, sender groups with the time under
 * each group, "Sent" / "Seen" under the reader's newest message and the typing indicator, newest at
 * the bottom (inverted list); scrolling up loads older pages. `start` (the safety tip) sits at the
 * very beginning of the conversation. Announced politely to screen readers.
 */
export function ThreadMessageList({
  messages,
  other,
  selfId,
  hasOlder,
  loadingOlder,
  olderFailed,
  typing,
  onLoadOlder,
  onRate,
  start,
}: ThreadMessageListProps) {
  const { palette } = useTheme();
  // Inverted list: the newest item first.
  const items = useMemo(() => buildThreadItems(messages, selfId).reverse(), [messages, selfId]);

  const renderItem = ({ item }: { item: ThreadItem }) => {
    if (item.kind === 'day') {
      return (
        <View accessibilityRole="header" style={styles.day}>
          <Text style={[styles.dayText, { color: palette.textMuted }]}>{item.label}</Text>
        </View>
      );
    }
    // The time under the last message of a group (screens 23 and 24), with "Sent" / "Seen" under
    // the reader's newest message.
    const showTime = item.lastOfGroup && item.message.kind !== 'SYSTEM';
    const receipt = item.status ? (item.status === 'seen' ? 'Seen' : 'Sent') : null;
    const footer = [
      showTime ? timeLabel(item.message.createdAt) : null,
      showTime && item.message.editedAt ? 'edited' : null,
      receipt,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <View style={item.firstOfGroup ? styles.groupStart : null}>
        <MessageBubble
          message={item.message}
          own={item.own}
          selfId={selfId}
          otherHandle={other.handle}
          onRate={onRate}
        />
        {footer ? (
          <Text
            testID={item.status ? `receipt-${item.status}` : undefined}
            style={[
              styles.time,
              item.own ? styles.ownTime : styles.otherTime,
              { color: palette.textMuted },
            ]}
          >
            {footer}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <FlatList
      testID="conversation-messages"
      accessibilityLabel={`Messages with ${other.handle}`}
      accessibilityLiveRegion="polite"
      inverted
      data={items}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      // Dragging the thread puts the keyboard away (review fix 1, F2), as in other chat apps.
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      onEndReached={() => {
        if (hasOlder && !loadingOlder && !olderFailed) {
          onLoadOlder();
        }
      }}
      onEndReachedThreshold={0.3}
      // Inverted: the header sits at the bottom (typing), the footer at the top (older pages).
      ListHeaderComponent={
        typing ? (
          <Text testID="typing-indicator" style={[styles.typing, { color: palette.textMuted }]}>
            {other.handle} is typing…
          </Text>
        ) : null
      }
      ListFooterComponent={
        hasOlder ? (
          <ListFooter
            loading={loadingOlder}
            failed={olderFailed}
            onRetry={onLoadOlder}
            testID="conversation-older"
          />
        ) : (
          <View style={styles.startBlock}>
            <Text testID="conversation-start" style={[styles.start, { color: palette.textMuted }]}>
              {CHAT_COPY.start(other.handle)}
            </Text>
            {start}
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  groupStart: { marginTop: spacing[1] },
  day: { alignItems: 'center', paddingVertical: 4 },
  dayText: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
  time: { fontSize: 11, lineHeight: 15, marginTop: 4, paddingHorizontal: 6 },
  ownTime: { alignSelf: 'flex-end' },
  otherTime: { alignSelf: 'flex-start' },
  typing: { fontStyle: 'italic', fontSize: 13, lineHeight: 18, marginTop: spacing[1] },
  startBlock: { marginBottom: spacing[2], gap: 6 },
  start: { textAlign: 'center', fontSize: 12, lineHeight: 16 },
});
