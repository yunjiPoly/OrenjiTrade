import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { WishlistItemResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { Chip } from '@/src/components/ui/Chip';
import { gameLabel } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { whichCopyLabel, wishCardParams, wishChips } from './wishlistLabels';

export interface WishCardProps {
  item: WishlistItemResponse;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
}

/**
 * One wish (stage S2, the web's `app-wish-card`): card art, game, name (to the card page with the
 * wish's selection), which copy, the public note, the "Near Mint only" and price term chips, and
 * the edit and remove buttons. No matches, no alert switch.
 */
export function WishCard({ item, busy, onEdit, onRemove }: WishCardProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const name = item.card?.name ?? 'Card';
  const image = item.printing?.images?.[0]?.url ?? item.card?.imageUrl ?? null;
  const params = wishCardParams(item);
  const chips = wishChips(item);
  // Named with which copy in the buttons: two wishes can name the same card.
  const copy = whichCopyLabel(item.printing, item.rarity);

  return (
    <View
      testID={`wish-${item.id}`}
      accessibilityLabel={`Wish: ${name}`}
      style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <View style={styles.top}>
        <CardImage src={image} alt={name} game={item.game} size="sm" />
        <View style={styles.grow}>
          <Text style={[textStyle('xs'), styles.strong, { color: palette.primary }]}>
            {gameLabel(item.game)}
          </Text>
          <Text
            accessibilityRole="link"
            onPress={() => (params ? router.push({ pathname: '/cards/[id]', params }) : undefined)}
            testID={`wish-name-${item.id}`}
            style={[textStyle('lg', 'heading'), styles.strong, { color: palette.ink }]}
          >
            {name}
          </Text>
          <Text
            testID={`wish-copy-${item.id}`}
            style={[textStyle('sm'), { color: palette.textMuted }]}
          >
            {copy}
          </Text>
        </View>
      </View>

      {item.note ? (
        <Text
          testID={`wish-note-${item.id}`}
          accessibilityLabel={`Public note: ${item.note}`}
          style={[textStyle('sm'), { color: palette.ink }]}
        >
          “{item.note}”
        </Text>
      ) : null}

      {chips.length ? (
        <View
          accessibilityLabel={`What you want for ${name}`}
          style={styles.chips}
          testID={`wish-chips-${item.id}`}
        >
          {chips.map((chip) => (
            <Chip key={chip.kind} label={chip.label} icon={chip.icon} tone="outline" />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="Edit"
          icon="pencil-outline"
          variant="secondary"
          onPress={onEdit}
          disabled={busy}
          accessibilityLabel={`Edit the wish for ${name} (${copy})`}
          testID={`wish-edit-${item.id}`}
        />
        <Button
          label="Remove"
          icon="delete-outline"
          variant="ghost"
          onPress={onRemove}
          disabled={busy}
          accessibilityLabel={`Remove ${name} (${copy}) from your wishlist`}
          testID={`wish-remove-${item.id}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, borderWidth: 1 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  grow: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
});
