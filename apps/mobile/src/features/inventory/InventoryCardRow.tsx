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

export interface InventoryCardRowProps {
  item: InventoryItemResponse;
  /** Opens Edit card (screen 7: there is no view-only card page). */
  onPress: (item: InventoryItemResponse) => void;
  /** Select mode: a checkbox, and the row toggles it instead of opening. */
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (item: InventoryItemResponse) => void;
  /** The card saved last stands out with an orange ring (screen 8). */
  highlighted?: boolean;
}

/**
 * One card of the Inventory (owner spec 2026-10-14, section 6, screen 1): only the card picture,
 * its name, the card code in mono, the asking price as typed on the right (nothing when there is
 * none) and "×{copies}". No set name, condition, availability, public badge or counts.
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
  // One line as in the mockup; two at large text sizes, where one line keeps only a word.
  const nameLines = useWindowDimensions().fontScale > 1.3 ? 2 : 1;
  const code = printingCode(item.printing);
  const price = itemPriceText(item);
  const spoken = [item.card.name, code, price, INVENTORY_COPY.copiesSpoken(item.quantity)]
    .filter(Boolean)
    .join(', ');
  const ring = selected || highlighted ? palette.primary : palette.border;

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
        <Text numberOfLines={1} style={[styles.code, { color: palette.textMuted }]}>
          {code}
        </Text>
      </View>
      <View style={styles.end}>
        {price ? (
          <Text
            numberOfLines={2}
            testID={`item-${item.id}-price`}
            style={[styles.price, { color: palette.ink }]}
          >
            {price}
          </Text>
        ) : null}
        <Text style={[styles.copies, { color: palette.textMuted }]}>
          {INVENTORY_COPY.copies(item.quantity)}
        </Text>
      </View>
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
  code: { fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 },
  end: { alignItems: 'flex-end', gap: 4, maxWidth: '40%' },
  price: { fontSize: 14, lineHeight: 18, fontWeight: fontWeight.bold, textAlign: 'right' },
  copies: { fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.8 },
});
