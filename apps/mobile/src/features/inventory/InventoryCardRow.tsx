import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { InventoryItemResponse } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { Text } from '@/src/components/ui/Text';
import { printingCode, printingImageUrl } from '@/src/lib/catalog';
import { fontFamily, fontWeight, spacing, useTheme } from '@/src/theme';

import { INVENTORY_COPY } from './inventoryCopy';
import { itemPriceText } from './itemPrice';
import { itemVisibilityTag, visibilityTagColors } from './visibilityTag';

export interface InventoryCardRowProps {
  item: InventoryItemResponse;
  /** Opens Edit card (screen 7: there is no view-only card page). */
  onPress: (item: InventoryItemResponse) => void;
  /** Select mode: a checkbox, and the row toggles it instead of opening. */
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (item: InventoryItemResponse) => void;
  /**
   * The card saved last stands out with an orange ring (screen 8); not in Select mode, where the
   * orange ring means "selected".
   */
  highlighted?: boolean;
}

/**
 * One card of the Inventory (owner spec 2026-10-14, section 6, screen 1): only the card picture,
 * its name, the card code in mono, the asking price as typed on the right (nothing when there is
 * none) and "×{copies}". No set name, condition, availability or counts. After the code, a small
 * tag says who can see the card (owner change of 2026-10-16, mockup v43): Private (a lock, grey),
 * Public (a globe, teal), or, for a card set to Public that nobody can see yet, the amber short
 * label of its status ("Public · not visible"). The bulk actions and the filter "Who can see it"
 * stay as they are; the tags follow them.
 */
export const InventoryCardRow = memo(function InventoryCardRow({
  item,
  onPress,
  selectable = false,
  selected = false,
  onToggle,
  highlighted = false,
}: InventoryCardRowProps) {
  const { palette } = useTheme();
  // One line as in the mockup. At large text sizes the price and the copies go under the code,
  // which gives the name the width of the row (side by side, names broke in the middle of a word)
  // and up to three lines.
  const { fontScale } = useWindowDimensions();
  const large = fontScale > 1.3;
  const nameLines = large ? 3 : 1;
  const code = printingCode(item.printing);
  const price = itemPriceText(item);
  const tag = itemVisibilityTag(item);
  const tagColors = visibilityTagColors(tag.kind, palette);
  const spoken = [
    item.card.name,
    code,
    tag.spoken,
    price,
    INVENTORY_COPY.copiesSpoken(item.quantity),
  ]
    .filter(Boolean)
    .join(', ');
  const ring =
    (selectable && selected) || (!selectable && highlighted) ? palette.primary : palette.border;
  const end = (
    <View style={large ? styles.endBelow : styles.end}>
      {price ? (
        <Text
          numberOfLines={2}
          testID={`item-${item.id}-price`}
          style={[styles.price, large && styles.priceBelow, { color: palette.ink }]}
        >
          {price}
        </Text>
      ) : null}
      <Text style={[styles.copies, { color: palette.textMuted }]}>
        {INVENTORY_COPY.copies(item.quantity)}
      </Text>
    </View>
  );

  return (
    <Pressable
      accessibilityRole={selectable ? 'checkbox' : 'button'}
      accessibilityLabel={spoken}
      accessibilityHint={selectable ? undefined : INVENTORY_COPY.rowHint}
      aria-checked={selectable ? selected : undefined}
      onPress={() => (selectable ? onToggle?.(item) : onPress(item))}
      testID={`item-${item.id}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.surface, borderColor: ring },
        pressed && styles.pressed,
      ]}
    >
      {selectable ? (
        <MaterialCommunityIcons
          name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={24}
          color={selected ? palette.primary : palette.textMuted}
          testID={`item-${item.id}-checkbox`}
        />
      ) : null}
      <CardImage
        src={printingImageUrl(item.printing)}
        alt=""
        game={item.card.game}
        size="xs"
        style={[styles.art, { borderColor: palette.borderStrong }]}
      />
      <View style={styles.text}>
        <Text numberOfLines={nameLines} style={[styles.name, { color: palette.ink }]}>
          {item.card.name}
        </Text>
        {/* The tag goes under the code when they do not fit side by side, and always at large
            text sizes, rather than squeezing the name. */}
        <View
          testID={`item-${item.id}-code-line`}
          style={large ? styles.codeLineBelow : styles.codeLine}
        >
          <Text numberOfLines={1} style={[styles.code, { color: palette.textMuted }]}>
            {code}
          </Text>
          <View
            testID={`item-${item.id}-visibility`}
            style={[styles.tag, { backgroundColor: tagColors.background }]}
          >
            <MaterialCommunityIcons
              name={tag.icon}
              // The icon grows with the label (at the largest sizes a 12 pt icon was a dot).
              size={Math.round(12 * Math.min(Math.max(fontScale, 1), 3))}
              color={tagColors.color}
            />
            <Text style={[styles.tagLabel, { color: tagColors.color }]}>{tag.label}</Text>
          </View>
        </View>
        {large ? end : null}
      </View>
      {large ? null : end}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 76,
    paddingVertical: spacing[2],
    paddingLeft: spacing[2],
    paddingRight: spacing[3],
    borderRadius: 14,
    borderWidth: 1,
  },
  art: { width: 42, height: 60, borderRadius: 5, borderWidth: 1 },
  text: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  code: { fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16, flexShrink: 1 },
  codeLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 8,
    rowGap: 4,
  },
  codeLineBelow: { alignItems: 'flex-start', gap: 4 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 20,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 6,
    flexShrink: 1,
  },
  tagLabel: { fontSize: 11, lineHeight: 14, fontWeight: fontWeight.semibold, flexShrink: 1 },
  end: { alignItems: 'flex-end', gap: 4, maxWidth: '40%' },
  endBelow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12 },
  price: { fontSize: 14, lineHeight: 18, fontWeight: fontWeight.bold, textAlign: 'right' },
  priceBelow: { textAlign: 'left', flexShrink: 1 },
  copies: { fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.8 },
});
