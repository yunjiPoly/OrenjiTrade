import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { WishlistItemResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { CardImage } from '@/src/components/ui/CardImage';
import { Chip } from '@/src/components/ui/Chip';
import { SwitchRow } from '@/src/components/ui/FormControls';
import { ListRow } from '@/src/components/ui/Layout';
import { gameLabel } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { matchCountLabel, wishCriteriaChips, wishPrintingLabel } from './wishlistLabels';

export interface WishCardProps {
  item: WishlistItemResponse;
  busy: boolean;
  onOpenMatches: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onActiveChange: (active: boolean) => void;
}

/**
 * One wish (the web's `app-wish-card`): card art, game, name (to the card page), printing or
 * "Any printing", criteria chips, the private note, the match count (to the matches), the alert
 * switch and the options (edit, see matches, remove).
 */
export function WishCard({
  item,
  busy,
  onOpenMatches,
  onEdit,
  onRemove,
  onActiveChange,
}: WishCardProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = item.card?.name ?? 'Card';
  const image = item.printing?.images?.[0]?.url ?? item.card?.imageUrl ?? null;
  const matched = item.active && item.matchCount > 0;

  return (
    <View
      testID={`wish-${item.id}`}
      accessibilityLabel={`Wish: ${name}`}
      style={[
        styles.card,
        {
          backgroundColor: palette.surface,
          borderColor: matched ? palette.primary : palette.border,
          opacity: item.active ? 1 : 0.85,
        },
      ]}
    >
      <View style={styles.top}>
        <CardImage src={image} alt={name} game={item.game} size="sm" />
        <View style={styles.grow}>
          <Text style={[textStyle('xs'), styles.strong, { color: palette.primary }]}>
            {gameLabel(item.game)}
          </Text>
          <Text
            accessibilityRole="link"
            onPress={() =>
              item.card?.id
                ? router.push({
                    pathname: '/cards/[id]',
                    params: item.printing?.id
                      ? { id: item.card.id, printing: item.printing.id }
                      : { id: item.card.id },
                  })
                : undefined
            }
            testID={`wish-name-${item.id}`}
            style={[textStyle('lg', 'heading'), styles.strong, { color: palette.ink }]}
          >
            {name}
          </Text>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            {wishPrintingLabel(item.printing)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Options for ${name}`}
          disabled={busy}
          onPress={() => setMenuOpen(true)}
          hitSlop={8}
          testID={`wish-menu-${item.id}`}
        >
          <MaterialCommunityIcons name="dots-vertical" size={24} color={palette.textMuted} />
        </Pressable>
      </View>

      <View
        accessibilityLabel={`What you want for ${name}`}
        style={styles.chips}
        testID={`wish-criteria-${item.id}`}
      >
        {wishCriteriaChips(item).map((chip) => (
          <Chip key={chip.kind} label={chip.label} icon={chip.icon} tone="outline" />
        ))}
      </View>

      {item.notes ? (
        <View style={styles.notes}>
          <MaterialCommunityIcons name="lock-outline" size={16} color={palette.textMuted} />
          <Text
            accessibilityLabel={`Private note: ${item.notes}`}
            style={[textStyle('sm'), styles.grow, { color: palette.textMuted }]}
          >
            {item.notes}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${matchCountLabel(item.matchCount)} for ${name}. See matches`}
        onPress={onOpenMatches}
        testID={`wish-matches-${item.id}`}
        style={({ pressed }) => [
          styles.matches,
          { backgroundColor: matched ? palette.primaryContainer : palette.surfaceVariant },
          pressed && styles.pressed,
        ]}
      >
        <MaterialCommunityIcons
          name={matched ? 'fire' : 'map-search-outline'}
          size={18}
          color={matched ? palette.onPrimaryContainer : palette.textMuted}
        />
        <Text
          testID={`wish-match-count-${item.id}`}
          style={[
            textStyle('sm'),
            styles.strong,
            styles.grow,
            { color: matched ? palette.onPrimaryContainer : palette.ink },
          ]}
        >
          {matchCountLabel(item.matchCount)}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={palette.textDisabled} />
      </Pressable>

      <SwitchRow
        label="Match alerts"
        help={item.active ? 'On: we tell you about new listings nearby.' : 'Paused'}
        value={item.active}
        onChange={onActiveChange}
        disabled={busy}
        testID={`wish-active-${item.id}`}
      />

      <BottomSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={name}
        testID={`wish-menu-sheet-${item.id}`}
      >
        <ListRow
          icon="pencil-outline"
          label="Edit wish"
          kind="button"
          onPress={() => {
            setMenuOpen(false);
            onEdit();
          }}
          testID="wish-edit"
        />
        <ListRow
          icon="map-search-outline"
          label="See matches"
          kind="button"
          onPress={() => {
            setMenuOpen(false);
            onOpenMatches();
          }}
          testID="wish-see-matches"
        />
        <ListRow
          icon="delete-outline"
          label="Remove from wishlist"
          kind="button"
          tone="danger"
          onPress={() => {
            setMenuOpen(false);
            onRemove();
          }}
          testID="wish-remove"
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, borderWidth: 1 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  grow: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  notes: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  matches: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
  },
  pressed: { opacity: 0.8 },
});
