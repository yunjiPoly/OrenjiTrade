import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CollectorMarker, PublicBinderSummary } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Badge } from '@/src/components/ui/Badge';
import { listingsLabel, ratingLabel, tagLabel } from '@/src/features/collectors/collectorLabels';
import { badgeFreshness, binderKindLabel, cardCount } from '@/src/lib/inventory';
import { GENERIC_PLACE_LABEL, placeLabel } from '@/src/lib/place';
import { gameLabel } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * A collector in search results (the web's `app-collector-result`): avatar, name, handle, their
 * state or province (never a position or a distance, ADR 0017), rating, listings, games and tags.
 * Opens the profile.
 */
export const CollectorResultRow = memo(function CollectorResultRow({
  collector,
  onPress,
}: {
  collector: CollectorMarker;
  onPress: (collector: CollectorMarker) => void;
}) {
  const { palette } = useTheme();
  const place = placeLabel(collector.place) ?? GENERIC_PLACE_LABEL;
  const games = collector.games.map(gameLabel).join(' · ');
  const tags = collector.tags.map((tag) => tagLabel(tag)).join(' · ');
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${collector.displayName}, @${collector.handle}, ${place}`}
      accessibilityHint="Opens the collector profile"
      onPress={() => onPress(collector)}
      testID={`collector-result-${collector.handle}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <Avatar src={collector.avatarUrl} name={collector.displayName} size={44} />
      <View style={styles.text}>
        <Text style={[textStyle('md'), styles.strong, { color: palette.ink }]} numberOfLines={1}>
          {collector.displayName}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]} numberOfLines={1}>
          @{collector.handle} · {place}
        </Text>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]} numberOfLines={1}>
          {ratingLabel(collector.rating)} · {listingsLabel(collector)}
        </Text>
        {games || tags ? (
          <Text style={[textStyle('xs'), { color: palette.textMuted }]} numberOfLines={1}>
            {[games, tags].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={palette.textDisabled} />
    </Pressable>
  );
});

/**
 * A public binder in search results (the web's `app-public-binder-card` + owner line): name,
 * kind, cards, games, freshness, and its owner with their state or province. Opens the public
 * binder.
 */
export const BinderResultRow = memo(function BinderResultRow({
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
      accessibilityLabel={`${binder.name}, ${binderKindLabel(binder.kind)}, ${cardCount(binder.itemCount)}${owner ? `, by ${owner.displayName}` : ''}`}
      accessibilityHint="Opens the public binder"
      onPress={() => onPress(binder)}
      testID={`binder-result-${binder.id}`}
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
        <Text style={[textStyle('md'), styles.strong, { color: palette.ink }]} numberOfLines={1}>
          {binder.name}
        </Text>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]} numberOfLines={1}>
          {binderKindLabel(binder.kind)} · {cardCount(binder.itemCount)}
          {games ? ` · ${games}` : ''}
        </Text>
        {owner ? (
          <View style={styles.owner}>
            <Avatar src={owner.avatarUrl} name={owner.displayName} size={20} />
            <Text
              style={[textStyle('xs'), styles.grow, { color: palette.textMuted }]}
              numberOfLines={1}
            >
              {owner.displayName}
              {place ? ` · ${place}` : ''}
            </Text>
          </View>
        ) : null}
        {binder.freshness.state !== 'ACTIVE' ? (
          <Badge variant="freshness" value={badgeFreshness(binder.freshness.state)} />
        ) : null}
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
  owner: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], marginTop: 2 },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
});
