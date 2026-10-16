import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { CardHolderResult } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Text } from '@/src/components/ui/Text';
import { itemPriceText } from '@/src/features/inventory/itemPrice';
import { printingCode } from '@/src/lib/catalog';
import { fontFamily, fontWeight, spacing, textStyle, useStackedRows, useTheme } from '@/src/theme';

import { CARD_PAGE_COPY } from '../search/searchCopy';

export interface HolderRowProps {
  result: CardHolderResult;
  /** "Message": opens or reuses the chat with this collector, pinning this card (stage R4). */
  onMessage: (result: CardHolderResult) => void;
  /** The chat is being opened for this holder (the button shows progress). */
  starting: boolean;
}

/**
 * One holder of "Who has this card" (owner spec 2026-10-14, section 8, mockup screen 13): avatar
 * and handle (they open the profile), "{code} · {rarity}", the asking price as typed, "×{copies}",
 * and a round Message button that opens the chat with this card pinned. Gone from the phone's row:
 * the set, condition, availability, note, freshness, "Make an offer" and "View binder". The place
 * is the group's title above (a state or province, ADR 0017).
 */
export const HolderRow = memo(function HolderRow({ result, onMessage, starting }: HolderRowProps) {
  const { palette } = useTheme();
  const router = useRouter();
  // Large text: the avatar, the handle and its line, then the price, one under the other (beside
  // the price the handle kept a third of the row and broke in the middle of a word).
  const stacked = useStackedRows();
  const { collector, item } = result;
  const code = printingCode(item.printing);
  const line = CARD_PAGE_COPY.printingLine(code, item.printing.rarity);
  const price = itemPriceText(item);
  const copies = `×${item.quantity}`;
  return (
    <View style={[styles.row, { borderBottomColor: palette.border }]} testID={`holder-${item.id}`}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${CARD_PAGE_COPY.openProfile(collector.handle)}. ${line}${
          price ? `, ${price}` : ''
        }, ${item.quantity} ${item.quantity === 1 ? 'copy' : 'copies'}`}
        onPress={() =>
          router.push({ pathname: '/collectors/[id]', params: { id: collector.handle } })
        }
        testID={`holder-${item.id}-collector`}
        style={({ pressed }) => [
          styles.who,
          stacked && styles.whoStacked,
          pressed && styles.pressed,
        ]}
      >
        <Avatar
          src={collector.avatarUrl}
          name={collector.displayName || collector.handle}
          size={44}
        />
        <View style={[styles.text, stacked && styles.stackedPart]}>
          <Text style={[textStyle('md'), styles.bold, { color: palette.ink }]}>
            {collector.handle}
          </Text>
          <Text style={[textStyle('xs'), styles.mono, { color: palette.textMuted }]}>{line}</Text>
        </View>
        <View style={[styles.price, stacked && styles.priceStacked]}>
          {price ? (
            <Text
              style={[
                textStyle('md'),
                styles.bold,
                stacked ? null : styles.right,
                { color: palette.ink },
              ]}
              numberOfLines={2}
              testID={`holder-${item.id}-price`}
            >
              {price}
            </Text>
          ) : null}
          <Text
            style={[textStyle('xs'), stacked ? null : styles.right, { color: palette.textMuted }]}
          >
            {copies}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={CARD_PAGE_COPY.message(collector.handle)}
        accessibilityState={{ busy: starting }}
        onPress={() => onMessage(result)}
        disabled={starting}
        testID={`holder-${item.id}-message`}
        style={({ pressed }) => [
          styles.message,
          { borderColor: palette.primary },
          pressed && styles.pressed,
        ]}
      >
        {starting ? (
          <ActivityIndicator size="small" color={palette.primary} />
        ) : (
          <MaterialCommunityIcons name="message-outline" size={20} color={palette.primary} />
        )}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 68,
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 44 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  bold: { fontWeight: fontWeight.semibold },
  mono: { fontFamily: fontFamily.mono },
  price: { maxWidth: '38%', alignItems: 'flex-end', gap: 2 },
  whoStacked: { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: spacing[1] },
  stackedPart: { flex: 0, alignSelf: 'stretch' },
  priceStacked: { maxWidth: '100%', alignItems: 'flex-start' },
  right: { textAlign: 'right' },
  message: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75 },
});
