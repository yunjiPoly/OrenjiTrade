import { Pressable, StyleSheet, View } from 'react-native';

import type { ConversationSubject } from '@/src/api/types';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, PINNED_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { PINNED_COPY } from './chatCopy';
import { pinnedEnd, pinnedLine, type DealSide } from './dealRules';
import { SubjectThumb } from './SubjectThumb';

/**
 * The pinned bar under the chat's top bar (owner spec 2026-10-14, section 10, mockup screens 23 and
 * 24): the card or deck core the chat is about, its picture, name and "{code} · {rarity}". Buying,
 * the price on the right and the bar opens the card page or the deck core page; once it is not on
 * offer any more, "No longer listed" and no price. Selling, "· your card" at the end of the line and
 * a teal "Mark as sold"; after a sale a "Sold" tag, for both sides.
 */
export function PinnedBar({
  subject,
  side,
  onOpen,
  onMarkSold,
}: {
  subject: ConversationSubject;
  side: DealSide;
  /** Opens what the chat is about (the buyer's bar). */
  onOpen: () => void;
  onMarkSold: () => void;
}) {
  const { palette } = useTheme();
  const line = pinnedLine(subject, side);
  const end = pinnedEnd(subject, side);
  const buying = side !== 'selling';
  const label = [
    subject.kind === 'DECK_CORE'
      ? PINNED_COPY.aboutDeckCore(subject.name)
      : PINNED_COPY.aboutCard(subject.name),
    line,
    end.kind === 'price' ? end.text : null,
    end.kind === 'sold' ? PINNED_COPY.sold : null,
    end.kind === 'unlisted' ? PINNED_COPY.noLongerListed : null,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <>
      <SubjectThumb subject={subject} size="bar" testID="pinned-thumb" />
      <View style={styles.text}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="pinned-name"
          style={[styles.name, { color: palette.ink }]}
        >
          {subject.name}
        </Text>
        {line ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            testID="pinned-line"
            style={[styles.line, { color: palette.textMuted }]}
          >
            {line}
          </Text>
        ) : null}
      </View>
      {end.kind === 'price' ? (
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="pinned-price"
          style={[styles.price, { color: palette.ink }]}
        >
          {end.text}
        </Text>
      ) : null}
      {end.kind === 'unlisted' ? (
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="pinned-unlisted"
          style={[styles.unlisted, { color: palette.textMuted }]}
        >
          {PINNED_COPY.noLongerListed}
        </Text>
      ) : null}
      {end.kind === 'sold' ? (
        <View
          testID="pinned-sold"
          style={[styles.soldTag, { backgroundColor: palette.chat.soldTagBackground }]}
        >
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.soldText, { color: palette.chat.soldTagText }]}
          >
            {PINNED_COPY.sold}
          </Text>
        </View>
      ) : null}
      {end.kind === 'markAsSold' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={PINNED_COPY.markAsSoldLabel(subject.name)}
          onPress={onMarkSold}
          hitSlop={5}
          testID="pinned-mark-sold"
          style={({ pressed }) => [
            styles.markSold,
            { borderColor: palette.accent },
            pressed && styles.pressed,
          ]}
        >
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.markSoldText, { color: palette.chat.saleAction }]}
          >
            {PINNED_COPY.markAsSold}
          </Text>
        </Pressable>
      ) : null}
    </>
  );

  const barStyle = [
    styles.bar,
    { borderBottomColor: palette.border, backgroundColor: palette.chat.pinnedBar },
  ];
  if (buying) {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        onPress={onOpen}
        testID="pinned-bar"
        style={({ pressed }) => [...barStyle, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View testID="pinned-bar" accessibilityLabel={label} style={barStyle}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  line: { fontSize: 12, lineHeight: 16 },
  price: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.bold },
  unlisted: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
  soldTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  soldText: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.bold },
  markSold: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markSoldText: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.bold },
  pressed: { opacity: 0.8 },
});
