import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CardSummary } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { gameLabel } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface CardRowProps {
  card: CardSummary;
  onPress: (card: CardSummary) => void;
}

/** One search result: thumbnail (an API picture URL only), name, game, type and printings. */
export const CardRow = memo(function CardRow({ card, onPress }: CardRowProps) {
  const { palette } = useTheme();
  const name = card.name ?? 'Unnamed card';
  const game = card.game ? gameLabel(card.game) : null;
  // "Pokémon · Pokémon · Basic" reads as a stutter: the type is left out when it is the game.
  const meta = [game, card.cardType !== game ? card.cardType : null, card.subtype]
    .filter(Boolean)
    .join(' · ');
  const printings = card.printingCount ?? 0;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={name}
      accessibilityHint={meta || undefined}
      onPress={() => onPress(card)}
      testID={`card-result-${card.slug ?? card.id}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <CardImage src={card.primaryImageUrl} alt="" game={card.game} size="sm" />
      <View style={styles.text}>
        <Text style={[textStyle('md'), styles.name, { color: palette.ink }]} numberOfLines={2}>
          {name}
        </Text>
        {meta ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          {printings === 1 ? '1 printing' : `${printings} printings`}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={palette.textDisabled} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  text: { flex: 1, gap: 2 },
  name: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
});
