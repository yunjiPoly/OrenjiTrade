import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CollectorMarker, NearbyCollectorsResponse } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { SponsoredSlot } from '@/src/features/ads/SponsoredSlot';
import { formatMoney } from '@/src/lib/catalog';
import { GENERIC_AREA_LABEL, placeLabel } from '@/src/lib/location';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  collectorDistanceLabel,
  collectorZoneLabel,
  listingsLabel,
  ratingLabel,
} from './discovery';
import { MapEmptyNotice } from './MapNotices';

export interface CollectorListProps {
  result: NearbyCollectorsResponse | undefined;
  error: unknown;
  onRetry: () => void;
  selfId: string | null;
  holders: boolean;
  selectedHandle: string | null;
  onSelect: (handle: string) => void;
  emptyTitle: string;
  onClearFilters?: () => void;
  /** Game filter of the map (targets the sponsored placement). */
  game?: string | null;
}

/**
 * The list alternative to the map (the web's `collector-list`): the same collectors, nearest
 * first as the API ranks them, with their place, distance bucket, rating and listings; a row opens
 * the preview. Accessible without the map, and the way screen readers browse collectors.
 */
export function CollectorList({
  result,
  error,
  onRetry,
  selfId,
  holders,
  selectedHandle,
  onSelect,
  emptyTitle,
  onClearFilters,
  game = null,
}: CollectorListProps) {
  const { palette } = useTheme();
  if (!result) {
    return error ? (
      <ErrorState
        testID="collector-list-error"
        error={error}
        title="Collectors could not load"
        onRetry={onRetry}
      />
    ) : (
      <View style={styles.padded}>
        <SkeletonList rows={5} rowHeight={72} testID="collector-list-loading" />
      </View>
    );
  }
  return (
    <FlatList
      testID="collector-list"
      data={result.collectors}
      keyExtractor={(collector) => collector.handle}
      contentContainerStyle={styles.padded}
      ItemSeparatorComponent={() => <View style={{ height: spacing[2] }} />}
      renderItem={({ item }) => (
        <CollectorRow
          collector={item}
          isSelf={!!selfId && item.id === selfId}
          selected={item.handle === selectedHandle}
          holders={holders}
          label={collectorZoneLabel(item, selfId)}
          onPress={() => onSelect(item.handle)}
        />
      )}
      ListHeaderComponent={
        <SponsoredSlot
          placement="MAP_PANEL"
          game={game}
          variant="compact"
          style={styles.sponsored}
        />
      }
      ListEmptyComponent={
        <MapEmptyNotice title={emptyTitle} onClearFilters={onClearFilters} inline />
      }
      ListFooterComponent={
        result.truncated ? (
          <Text
            testID="collector-list-truncated"
            style={[textStyle('sm'), styles.footer, { color: palette.textMuted }]}
          >
            Showing the {result.collectors.length} nearest of {result.total} collectors. Zoom in or
            add filters to see the others.
          </Text>
        ) : null
      }
    />
  );
}

function CollectorRow({
  collector,
  isSelf,
  selected,
  holders,
  label,
  onPress,
}: {
  collector: CollectorMarker;
  isSelf: boolean;
  selected: boolean;
  holders: boolean;
  label: string;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const place = placeLabel(collector.publicLabel) ?? GENERIC_AREA_LABEL;
  const cheapest = holders
    ? collector.matchingItems
        .map((item) => ({ item, price: item.askingPrice }))
        .filter((entry): entry is { item: typeof entry.item; price: number } => entry.price != null)
        .sort((a, b) => a.price - b.price)[0]
    : undefined;
  return (
    <Pressable
      testID={`collector-row-${collector.handle}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the collector preview"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: palette.surface,
          borderColor: selected ? palette.primary : palette.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <Avatar src={collector.avatarUrl} name={collector.displayName} size={44} />
      <View style={styles.grow}>
        <Text style={[textStyle('md'), styles.name, { color: palette.ink }]} numberOfLines={1}>
          {isSelf ? `You (${collector.displayName})` : collector.displayName}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]} numberOfLines={1}>
          {place} · {collectorDistanceLabel(collector.distanceBucket, isSelf)}
        </Text>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]} numberOfLines={1}>
          {ratingLabel(collector.rating)} · {listingsLabel(collector)}
        </Text>
        {holders && collector.matchingItems.length > 0 ? (
          <Text
            testID={`collector-row-${collector.handle}-listings`}
            style={[textStyle('xs'), styles.name, { color: palette.accent }]}
          >
            {collector.matchingItems.length === 1
              ? '1 listing of this card'
              : `${collector.matchingItems.length} listings of this card`}
            {cheapest ? ` · from ${formatMoney(cheapest.price, cheapest.item.currency) ?? ''}` : ''}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sponsored: { marginBottom: spacing[2] },
  padded: { padding: spacing[4], paddingBottom: spacing[16] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
  },
  grow: { flex: 1, gap: 2 },
  name: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
  footer: { textAlign: 'center', marginTop: spacing[3] },
});
