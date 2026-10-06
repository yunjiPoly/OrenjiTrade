import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCollectorBinders } from '@/src/api/hooks/collectors';
import { useCollectorPreview } from '@/src/api/hooks/discovery';
import type { CardDetail, CollectorMarker, CollectorPreview, MatchingItem } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Badge } from '@/src/components/ui/Badge';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ChipList } from '@/src/components/ui/Layout';
import { Skeleton, SkeletonList } from '@/src/components/ui/Skeleton';
import { MessageAction } from '@/src/features/collectors/MessageAction';
import { useMessageCollector } from '@/src/features/messages/useMessageCollector';
import { MakeOfferButton } from '@/src/features/offers/MakeOfferButton';
import { offerTargetFromMatch, sellerFromPreview } from '@/src/features/offers/offerTarget';
import { reportParams } from '@/src/features/reports/reportLabels';
import { APPROXIMATE_LOCATION_NOTE } from '@/src/lib/approximateArea';
import { formatMoney, printingImageUrl } from '@/src/lib/catalog';
import { badgeFreshness, conditionLabel } from '@/src/lib/inventory';
import { GENERIC_AREA_LABEL, placeLabel, type LatLng } from '@/src/lib/location';
import { LAST_ACTIVE_LABELS, gameLabel } from '@/src/lib/profile';
import { fontFamily, fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

import { collectorDistanceLabel, listingsLabel, ratingLabel, tagLabel } from './discovery';

export interface CollectorPreviewSheetProps {
  /** Handle of the previewed collector; null closes the sheet. */
  handle: string | null;
  /** The collector's entry of the map's answer (name while loading, listings of the card). */
  marker: CollectorMarker | null;
  /** A city the map shows (distance from there), never the viewer's own area. */
  centre: LatLng | null;
  selfId: string | null;
  /** "Who has this near me": the card, for the pictures of the collector's listings. */
  holdersCard: CardDetail | null;
  onClose: () => void;
  /** "Show on map": zoom to the collector's zone (never past the cap). */
  onShowOnMap?: (handle: string) => void;
}

/**
 * The collector preview of the Map tab, in a bottom sheet (the web's `collector-preview-card` on
 * `GET /collectors/{handle}/preview`): name, avatar, approximate place with the "about 3 km" note,
 * bucketed distance, rating, last activity, listings, games and tags, the collector's listings of
 * the card in "who has this near me" mode (each with "Make an offer" when it accepts one), and
 * View profile / View public binder / Message (only when the collector accepts messages from the
 * viewer) / Show on map / Report.
 */
export function CollectorPreviewSheet({
  handle,
  marker,
  centre,
  selfId,
  holdersCard,
  onClose,
  onShowOnMap,
}: CollectorPreviewSheetProps) {
  // The last collector stays rendered while the sheet animates closed.
  const [shown, setShown] = useState<{ handle: string; marker: CollectorMarker | null } | null>(
    null
  );
  if (handle && (shown?.handle !== handle || shown.marker !== marker)) {
    setShown({ handle, marker });
  }
  return (
    <BottomSheet visible={!!handle} onClose={onClose} testID="collector-preview">
      {shown ? (
        <PreviewContent
          handle={shown.handle}
          marker={shown.marker}
          centre={centre}
          selfId={selfId}
          holdersCard={holdersCard}
          onClose={onClose}
          onShowOnMap={onShowOnMap}
        />
      ) : null}
    </BottomSheet>
  );
}

interface PreviewContentProps extends Omit<CollectorPreviewSheetProps, 'handle' | 'marker'> {
  handle: string;
  marker: CollectorMarker | null;
}

function PreviewContent({
  handle,
  marker,
  centre,
  selfId,
  holdersCard,
  onClose,
  onShowOnMap,
}: PreviewContentProps) {
  const { palette } = useTheme();
  // Kept (from the cache) while the sheet animates closed.
  const preview = useCollectorPreview(handle, centre);

  if (preview.data) {
    return (
      <ReadyPreview
        preview={preview.data}
        isSelf={!!selfId && preview.data.id === selfId}
        matchingItems={marker?.matchingItems ?? []}
        holdersCard={holdersCard}
        onClose={onClose}
        onShowOnMap={onShowOnMap && marker ? () => onShowOnMap(handle) : undefined}
      />
    );
  }
  if (preview.error?.status === 404) {
    return (
      <View testID="collector-preview-not-found" style={styles.block}>
        <Text
          accessibilityRole="header"
          style={[textStyle('lg', 'heading'), { color: palette.ink }]}
        >
          Collector unavailable
        </Text>
        <Text style={[textStyle('md'), { color: palette.textMuted }]}>
          This collector is no longer on the map. Their profile may have become private.
        </Text>
        <Button label="Close" variant="secondary" onPress={onClose} />
      </View>
    );
  }
  if (preview.error) {
    return (
      <ErrorState
        compact
        testID="collector-preview-error"
        error={preview.error}
        title="The preview could not load"
        onRetry={() => void preview.refetch()}
      />
    );
  }
  return (
    <View testID="collector-preview-loading" aria-busy style={styles.block}>
      <View style={styles.head}>
        <Skeleton width={56} height={56} radius={28} />
        <View style={styles.grow}>
          <Text
            accessibilityRole="header"
            style={[textStyle('lg', 'heading'), styles.name, { color: palette.ink }]}
          >
            {marker?.displayName ?? 'Loading collector'}
          </Text>
          <Skeleton width="60%" height={14} />
        </View>
      </View>
      <SkeletonList rows={2} rowHeight={40} />
    </View>
  );
}

interface ReadyPreviewProps {
  preview: CollectorPreview;
  isSelf: boolean;
  matchingItems: readonly MatchingItem[];
  holdersCard: CardDetail | null;
  onClose: () => void;
  onShowOnMap?: () => void;
}

function ReadyPreview({
  preview,
  isSelf,
  matchingItems,
  holdersCard,
  onClose,
  onShowOnMap,
}: ReadyPreviewProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const binders = useCollectorBinders(preview.handle, preview.publicBinderCount > 0);
  const firstBinder = preview.publicBinderCount > 0 ? (binders.data?.[0] ?? null) : null;
  const { message, startingId } = useMessageCollector(onClose);
  const place = placeLabel(preview.publicLabel) ?? GENERIC_AREA_LABEL;
  const lastActive =
    preview.lastActiveBucket !== 'HIDDEN' ? LAST_ACTIVE_LABELS[preview.lastActiveBucket] : null;

  const open = (navigate: () => void) => {
    onClose();
    navigate();
  };

  return (
    <ScrollView
      testID="collector-preview-ready"
      contentContainerStyle={styles.block}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.head}>
        <View>
          <Avatar src={preview.avatarUrl} name={preview.displayName} size={56} />
          {preview.onlineStatus === 'ONLINE' ? (
            <View
              accessibilityLabel="Online now"
              accessibilityRole="image"
              style={[styles.online, { backgroundColor: palette.online.online }]}
            />
          ) : null}
        </View>
        <View style={styles.grow}>
          <Text
            accessibilityRole="header"
            testID="preview-name"
            style={[textStyle('lg', 'heading'), styles.name, { color: palette.ink }]}
          >
            {preview.displayName}
          </Text>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>@{preview.handle}</Text>
          <Fact icon="map-marker-radius-outline" testID="preview-place" text={place} />
        </View>
      </View>

      <View
        testID="preview-approximate"
        style={[styles.note, { backgroundColor: palette.surfaceVariant }]}
      >
        <MaterialCommunityIcons name="shield-account-outline" size={18} color={palette.accent} />
        <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
          {APPROXIMATE_LOCATION_NOTE}
        </Text>
      </View>

      <View style={styles.facts} accessibilityLabel="About this collector">
        <Fact
          icon="near-me"
          testID="preview-distance"
          text={collectorDistanceLabel(preview.distanceBucket, isSelf)}
        />
        <Fact icon="star-outline" testID="preview-rating" text={ratingLabel(preview.rating)} />
        {lastActive ? (
          <Fact icon="clock-outline" testID="preview-active" text={lastActive} />
        ) : null}
      </View>

      <View style={styles.listings}>
        {preview.binderFreshness ? (
          <Badge variant="freshness" value={badgeFreshness(preview.binderFreshness)} />
        ) : null}
        <Text testID="preview-listings" style={[textStyle('sm'), { color: palette.textMuted }]}>
          {listingsLabel(preview)}
        </Text>
      </View>

      {preview.games.length > 0 ? <ChipList items={preview.games.map(gameLabel)} /> : null}
      {preview.tags.length > 0 ? (
        <ChipList items={preview.tags.map(tagLabel)} testID="preview-tags" />
      ) : null}

      {matchingItems.length > 0 ? (
        <View testID="preview-matching-items" style={styles.items}>
          <Text style={[textStyle('sm'), styles.name, { color: palette.ink }]}>
            Listings of this card by {preview.displayName}
          </Text>
          {matchingItems.map((item) => (
            <MatchingItemRow
              key={item.itemId}
              item={item}
              card={holdersCard}
              preview={preview}
              onClose={onClose}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="View profile"
          icon="account-outline"
          testID="preview-view-profile"
          onPress={() =>
            open(() =>
              router.push({ pathname: '/collectors/[id]', params: { id: preview.handle } })
            )
          }
        />
        <Button
          label="View public binder"
          icon="book-open-variant"
          variant="secondary"
          testID="preview-view-binder"
          disabled={!firstBinder}
          accessibilityHint={
            firstBinder
              ? undefined
              : preview.publicBinderCount > 0
                ? 'Loading public binders…'
                : 'No public binder yet'
          }
          onPress={() =>
            firstBinder
              ? open(() =>
                  router.push({ pathname: '/binders/[id]', params: { id: firstBinder.id } })
                )
              : undefined
          }
        />
        {isSelf ? null : (
          <MessageAction
            displayName={preview.displayName}
            canMessage={preview.canMessage}
            isBlocked={preview.isBlocked}
            starting={startingId === preview.id}
            onMessage={() => void message(preview.id)}
            testID="preview-message"
          />
        )}
        {onShowOnMap ? (
          <Button
            label="Show on map"
            icon="map-search-outline"
            variant="ghost"
            testID="preview-show-on-map"
            onPress={onShowOnMap}
          />
        ) : null}
        {isSelf ? null : (
          <Button
            label="Report"
            icon="flag-outline"
            variant="ghost"
            accessibilityLabel={`Report ${preview.displayName}`}
            testID="preview-report"
            onPress={() =>
              open(() =>
                router.push({
                  pathname: '/report',
                  params: reportParams(preview, { source: 'PROFILE' }),
                })
              )
            }
          />
        )}
      </View>
    </ScrollView>
  );
}

function MatchingItemRow({
  item,
  card,
  preview,
  onClose,
}: {
  item: MatchingItem;
  card: CardDetail | null;
  preview: CollectorPreview;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const printing = card?.printings?.find((candidate) => candidate.id === item.printingId) ?? null;
  const price =
    formatMoney(item.askingPrice, item.currency) ??
    (item.acceptsOffers ? 'Make an offer' : 'No price');
  return (
    <View style={styles.itemBlock}>
      <View style={styles.item} testID={`preview-item-${item.itemId}`}>
        <CardImage
          src={printingImageUrl(printing)}
          alt={item.cardName}
          game={item.game}
          size="xs"
        />
        <View style={styles.grow}>
          <Text style={[textStyle('sm'), styles.mono, { color: palette.ink }]}>
            {item.printingCode ?? item.cardName}
          </Text>
          <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
            {conditionLabel(item.condition)}
          </Text>
        </View>
        <Text style={[textStyle('sm'), styles.name, { color: palette.ink }]}>{price}</Text>
      </View>
      <MakeOfferButton
        target={offerTargetFromMatch(item, sellerFromPreview(preview), printingImageUrl(printing))}
        beforeOpen={onClose}
        testID={`preview-offer-${item.itemId}`}
      />
    </View>
  );
}

function Fact({
  icon,
  text,
  testID,
}: {
  icon: 'near-me' | 'star-outline' | 'clock-outline' | 'map-marker-radius-outline';
  text: string;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.fact}>
      <MaterialCommunityIcons name={icon} size={16} color={palette.textMuted} />
      <Text testID={testID} style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing[3], paddingBottom: spacing[2] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  grow: { flexShrink: 1, flexGrow: 1 },
  name: { fontWeight: fontWeight.semibold },
  mono: { fontFamily: fontFamily.mono },
  online: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: 8,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  facts: { gap: spacing[1] },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  listings: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  items: { gap: spacing[2] },
  itemBlock: { gap: spacing[1] },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  actions: { gap: spacing[2] },
});
