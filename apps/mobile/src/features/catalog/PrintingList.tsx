import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PrintingSummary } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import {
  formatMarketPrice,
  printingCode,
  printingFacts,
  printingImageUrl,
} from '@/src/lib/catalog';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface PrintingListProps {
  printings: readonly PrintingSummary[];
  cardName: string;
  game: string | null | undefined;
  selectedId: string | null;
  onSelect: (printing: PrintingSummary) => void;
  /** Accessible name of the list. */
  label: string;
  /** Show the market price of each printing (card detail). */
  showPrice?: boolean;
  testID?: string;
}

/**
 * The printings of a card as a single-choice list: picture, printing code, set, rarity, edition,
 * language and finish (card detail and the "Add a card" printing step).
 */
export function PrintingList({
  printings,
  cardName,
  game,
  selectedId,
  onSelect,
  label,
  showPrice = false,
  testID = 'printing-list',
}: PrintingListProps) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={styles.list}
      testID={testID}
    >
      {printings.map((printing) => {
        const selected = printing.id === selectedId;
        const code = printingCode(printing);
        const price = showPrice ? formatMarketPrice(printing.marketPrice) : null;
        const facts = printingFacts(printing);
        return (
          <Pressable
            key={printing.id}
            accessibilityRole="radio"
            accessibilityLabel={`${code}, ${printing.setName ?? ''}, ${facts}`}
            aria-checked={selected}
            onPress={() => onSelect(printing)}
            testID={`printing-${printing.id}`}
            style={({ pressed }) => [
              styles.row,
              {
                borderColor: selected ? palette.primary : palette.border,
                backgroundColor: selected ? palette.primaryContainer : palette.surface,
              },
              pressed && styles.pressed,
            ]}
          >
            <CardImage src={printingImageUrl(printing)} alt="" game={game} size="xs" />
            <View style={styles.text}>
              <Text style={[styles.code, { color: palette.ink }]}>{code}</Text>
              <Text style={[textStyle('sm'), { color: palette.ink }]} numberOfLines={1}>
                {printing.setName ?? cardName}
                {printing.setCode ? ` (${printing.setCode})` : ''}
              </Text>
              <Text style={[textStyle('xs'), { color: palette.textMuted }]} numberOfLines={2}>
                {facts}
              </Text>
              {showPrice ? (
                <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                  {price ? `Market ${price}` : 'No market price yet'}
                </Text>
              ) : null}
            </View>
            <MaterialCommunityIcons
              name={selected ? 'radiobox-marked' : 'radiobox-blank'}
              size={22}
              color={selected ? palette.primary : palette.textMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  text: { flex: 1, gap: 2 },
  code: { fontFamily: fontFamily.mono, fontWeight: fontWeight.semibold, fontSize: 14 },
  pressed: { opacity: 0.8 },
});
