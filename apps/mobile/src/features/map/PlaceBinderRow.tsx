import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PublicBinderSummary } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Badge } from '@/src/components/ui/Badge';
import { badgeFreshness, binderKindLabel, cardCount } from '@/src/lib/inventory';
import { placeLabel } from '@/src/lib/place';
import { gameLabel } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/** What a screen reader says for a binder of a state or province. */
export function placeBinderLabel(binder: PublicBinderSummary): string {
  const owner = binder.owner;
  const place = placeLabel(owner?.place);
  return [
    binder.name,
    binderKindLabel(binder.kind),
    cardCount(binder.itemCount),
    owner ? `by ${owner.displayName}, @${owner.handle}` : null,
    place,
    binder.freshness.label,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * A public binder in the list of a state or province (the web's `app-subdivision-panel` rows):
 * its name, kind, number of cards and games, its owner by name and handle, the owner's state or
 * province and country (the API's `place`; a city is never part of it, ADR 0017) and when it was
 * last updated. Opens the public binder.
 */
export const PlaceBinderRow = memo(function PlaceBinderRow({
  binder,
  onPress,
}: {
  binder: PublicBinderSummary;
  onPress: (binder: PublicBinderSummary) => void;
}) {
  const { palette } = useTheme();
  const owner = binder.owner;
  const place = placeLabel(owner?.place);
  const games = binder.games.map(gameLabel).join(', ');
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={placeBinderLabel(binder)}
      accessibilityHint="Opens the public binder"
      onPress={() => onPress(binder)}
      testID={`place-binder-${binder.id}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: palette.primaryContainer }]}>
        <MaterialCommunityIcons
          name="book-open-page-variant-outline"
          size={24}
          color={palette.onPrimaryContainer}
        />
      </View>
      <View style={styles.text}>
        <Text style={[textStyle('md'), styles.strong, { color: palette.ink }]}>{binder.name}</Text>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          {binderKindLabel(binder.kind)} · {cardCount(binder.itemCount)}
          {games ? ` · ${games}` : ''}
        </Text>
        {owner ? (
          <View style={styles.line}>
            <Avatar src={owner.avatarUrl} name={owner.displayName} size={20} />
            <Text
              style={[textStyle('sm'), styles.grow, { color: palette.ink }]}
              testID={`place-binder-owner-${binder.id}`}
            >
              {owner.displayName} <Text style={{ color: palette.textMuted }}>@{owner.handle}</Text>
            </Text>
          </View>
        ) : null}
        {place ? (
          <View style={styles.line}>
            <MaterialCommunityIcons name="map-marker-outline" size={16} color={palette.textMuted} />
            <Text
              style={[textStyle('xs'), styles.grow, { color: palette.textMuted }]}
              testID={`place-binder-place-${binder.id}`}
            >
              {place}
            </Text>
          </View>
        ) : null}
        <View style={styles.line}>
          <Text
            style={[textStyle('xs'), { color: palette.textMuted }]}
            testID={`place-binder-updated-${binder.id}`}
          >
            {binder.freshness.label}
          </Text>
          {binder.freshness.state !== 'ACTIVE' ? (
            <Badge variant="freshness" value={badgeFreshness(binder.freshness.state)} />
          ) : null}
        </View>
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
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[1] },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
});
