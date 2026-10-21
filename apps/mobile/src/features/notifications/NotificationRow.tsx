import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { NotificationResponse } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, useStackedRows, useTheme, type Palette } from '@/src/theme';

import { NOTIFICATIONS_COPY } from './notificationCopy';
import { notificationCard } from './notificationKinds';
import {
  isFreshnessRow,
  notificationTime,
  rowLabel,
  rowText,
  rowVisual,
  type ReminderState,
  type RowTone,
} from './notificationRows';

/** The icon tile's colours of a tone (mockup v50 screen 31). */
export function toneColors(tone: RowTone, palette: Palette): { background: string; icon: string } {
  const colors = palette.notifications;
  switch (tone) {
    case 'wish':
      return { background: colors.wishBackground, icon: colors.wishIcon };
    case 'sale':
      return { background: colors.saleBackground, icon: colors.saleIcon };
    case 'star':
      return { background: colors.starBackground, icon: colors.starIcon };
    case 'remind':
      return { background: colors.remindBackground, icon: colors.remindIcon };
    default:
      return { background: colors.flagBackground, icon: colors.flagIcon };
  }
}

export interface NotificationRowProps {
  notification: NotificationResponse;
  now: Date;
  /** Where tapping the row leads (null: nothing opens; an unread row is then marked read). */
  target: string | null;
  onOpen: (notification: NotificationResponse, target: string | null) => void;
  /** A freshness row's state and buttons. */
  reminder?: {
    state: ReminderState;
    confirming: boolean;
    onConfirm: () => void;
    onReview: () => void;
  };
}

/**
 * One notification (mockup v50 screen 31): an icon tile in its kind's colours, "{bold subject}
 * {rest of the sentence}", one muted line, the time, the card's picture when there is one, an
 * orange dot while unread. A freshness reminder is answered in place: "Still have them" and
 * "Review the binder", then a teal check once the binder is confirmed.
 */
export function NotificationRow({
  notification,
  now,
  target,
  onOpen,
  reminder,
}: NotificationRowProps) {
  const { palette } = useTheme();
  const stacked = useStackedRows();
  const colors = palette.notifications;
  const unread = !notification.readAt;
  const visual = rowVisual(notification);
  const tone = toneColors(visual.tone, palette);
  const text = rowText(notification);
  const time = notificationTime(notification.createdAt, now);
  const card = isFreshnessRow(notification) ? null : notificationCard(notification);
  const label = rowLabel(text, time.spoken, unread);
  const pressable = target !== null || unread;

  const lines = (
    <>
      <Text style={[styles.sentence, { color: colors.restText }]}>
        <Text style={[styles.strong, { color: palette.ink }]}>{text.strong}</Text>
        {text.rest ? ` ${text.rest}` : ''}
      </Text>
      {text.sub ? (
        <Text numberOfLines={stacked ? 3 : 1} style={[styles.sub, { color: palette.textMuted }]}>
          {text.sub}
        </Text>
      ) : null}
      <Text style={[styles.time, { color: unread ? colors.timeUnread : colors.timeRead }]}>
        {time.short}
      </Text>
    </>
  );

  const body = reminder ? (
    <View style={styles.text}>
      <Pressable
        accessible
        accessibilityRole={unread ? 'button' : 'text'}
        accessibilityLabel={label}
        accessibilityHint={unread ? NOTIFICATIONS_COPY.markReadHint : undefined}
        disabled={!unread}
        onPress={() => onOpen(notification, null)}
        testID={`notification-${notification.id}`}
        style={styles.lines}
      >
        {lines}
      </Pressable>
      <ReminderActions notificationId={notification.id} {...reminder} />
    </View>
  ) : (
    <View style={styles.text}>{lines}</View>
  );

  const content = (
    <>
      <View
        style={[styles.tile, { backgroundColor: tone.background }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <MaterialCommunityIcons name={visual.icon} size={20} color={tone.icon} />
      </View>
      {body}
      {card && !stacked ? (
        <CardImage
          src={card.imageUrl}
          alt=""
          game={card.game}
          size="xs"
          testID={`notification-card-${notification.id}`}
          style={[styles.thumb, { borderColor: colors.thumbBorder }]}
        />
      ) : null}
      {unread ? (
        // Said by the row's name ("…, unread"); a plain view, never focused on its own.
        <View
          testID="notification-unread-dot"
          style={[styles.dot, { backgroundColor: colors.dot }]}
        />
      ) : null}
    </>
  );

  const rowStyle = [
    styles.row,
    {
      backgroundColor: unread ? colors.unreadRow : 'transparent',
      borderBottomColor: colors.rowBorder,
    },
  ];

  if (reminder || !pressable) {
    return (
      <View
        style={rowStyle}
        testID={
          reminder ? `notification-row-${notification.id}` : `notification-${notification.id}`
        }
        accessible={!reminder}
        accessibilityLabel={reminder ? undefined : label}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole={target ? 'link' : 'button'}
      accessibilityLabel={label}
      accessibilityHint={target ? undefined : NOTIFICATIONS_COPY.markReadHint}
      onPress={() => onOpen(notification, target)}
      testID={`notification-${notification.id}`}
      style={({ pressed }) => [rowStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

function ReminderActions({
  notificationId,
  state,
  confirming,
  onConfirm,
  onReview,
}: { notificationId: string } & NonNullable<NotificationRowProps['reminder']>) {
  const { palette } = useTheme();
  const colors = palette.notifications;
  const copy = NOTIFICATIONS_COPY.reminder;
  if (state === 'gone') {
    return null;
  }
  if (state === 'confirmed') {
    return (
      <View
        style={styles.confirmed}
        accessible
        // Its words only (the check's glyph would be read as a character).
        accessibilityLabel={copy.confirmed}
        accessibilityLiveRegion="polite"
        testID={`notification-confirmed-${notificationId}`}
      >
        <MaterialCommunityIcons name="check" size={16} color={palette.accent} />
        <Text style={[styles.confirmedText, { color: palette.accent }]}>{copy.confirmed}</Text>
      </View>
    );
  }
  const review = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={state === 'unfiled' ? copy.reviewCards : copy.review}
      onPress={onReview}
      hitSlop={{ top: 4, bottom: 4 }}
      testID={`notification-review-${notificationId}`}
      // Alone, it lines up with the text above (beside "Still have them", it keeps its padding).
      style={({ pressed }) => [
        styles.review,
        state !== 'pending' && styles.reviewAlone,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.reviewText, { color: colors.reviewText }]}>
        {state === 'unfiled' ? copy.reviewCards : copy.review}
      </Text>
    </Pressable>
  );
  return (
    <View style={styles.actions}>
      {state === 'pending' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.stillHave}
          accessibilityState={{ busy: confirming, disabled: confirming }}
          disabled={confirming}
          onPress={onConfirm}
          hitSlop={{ top: 4, bottom: 4 }}
          testID={`notification-still-have-${notificationId}`}
          style={({ pressed }) => [
            styles.stillHave,
            { borderColor: colors.action },
            (pressed || confirming) && styles.pressed,
          ]}
        >
          <Text style={[styles.stillHaveText, { color: colors.action }]}>{copy.stillHave}</Text>
        </Pressable>
      ) : null}
      {review}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  pressed: { opacity: 0.75 },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: 3 },
  lines: { gap: 3 },
  sentence: { fontSize: 14, lineHeight: 20 },
  strong: { fontWeight: fontWeight.semibold },
  sub: { fontSize: 13, lineHeight: 18 },
  time: { fontSize: 12, lineHeight: 16 },
  thumb: { width: 34, height: 48, borderRadius: 4, borderWidth: 1 },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 16 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  stillHave: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stillHaveText: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.bold },
  review: { minHeight: 36, paddingHorizontal: 10, justifyContent: 'center' },
  reviewAlone: { paddingLeft: 0 },
  reviewText: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  confirmed: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  confirmedText: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
});
