import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { WishlistMatchResponse } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { Chip } from '@/src/components/ui/Chip';
import { collectorDistanceLabel, ratingLabel } from '@/src/features/map/discovery';
import { MakeOfferButton } from '@/src/features/offers/MakeOfferButton';
import { offerTargetFromItem, sellerFromMarker } from '@/src/features/offers/offerTarget';
import {
  editionLabel,
  formatMoney,
  languageName,
  printingCode,
  printingImageUrl,
} from '@/src/lib/catalog';
import { availabilityLabel, conditionLabel } from '@/src/lib/inventory';
import { LAST_ACTIVE_LABELS } from '@/src/lib/profile';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface WishMatchCardProps {
  match: WishlistMatchResponse;
  /** The conversation with this collector is being opened. */
  messaging: boolean;
  dismissing: boolean;
  onMessage: () => void;
  onDismiss: () => void;
}

/** "Holders of this printing" on the Map tab (the list shows who they are). */
export function mapParamsFor(match: Pick<WishlistMatchResponse, 'item'>): Record<string, string> {
  const item = match.item;
  return item.printing?.id ? { printing: item.printing.id } : { card: item.card?.id ?? '' };
}

/**
 * One match of a wish (the web's `app-wish-match-card`): the collector (name, approximate place,
 * the API's distance bucket, rating, activity) and the matching public item (picture, printing,
 * condition / availability / offers, price, freshness, public note), with Message, Make an offer
 * (when the card accepts one), View profile, View binder, On the map and Dismiss. Never a coordinate: places and distances are the server's
 * approximations.
 */
export function WishMatchCard({
  match,
  messaging,
  dismissing,
  onMessage,
  onDismiss,
}: WishMatchCardProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const collector = match.collector;
  const item = match.item;
  const image = item.images?.[0]?.url ?? printingImageUrl(item.printing);
  const price = formatMoney(item.askingPrice ?? null, item.currency);
  const details = [languageName(item.language), editionLabel(item.edition)]
    .filter((part) => part && part !== '—')
    .join(' · ');
  const lastActive =
    collector.lastActiveBucket !== 'HIDDEN' ? LAST_ACTIVE_LABELS[collector.lastActiveBucket] : null;
  const name = item.card?.name ?? 'Card';

  return (
    <View
      testID={`match-${match.id}`}
      accessibilityLabel={`Match from ${collector.displayName}`}
      style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <View style={styles.who}>
        <View>
          <Avatar src={collector.avatarUrl} name={collector.displayName} size={44} />
          {collector.onlineStatus === 'ONLINE' ? (
            <View
              accessibilityLabel="Online now"
              style={[
                styles.online,
                { backgroundColor: palette.online.online, borderColor: palette.surface },
              ]}
            />
          ) : null}
        </View>
        <View style={styles.grow}>
          <Text
            accessibilityRole="link"
            onPress={() =>
              router.push({ pathname: '/collectors/[id]', params: { id: collector.handle } })
            }
            testID={`match-collector-${match.id}`}
            style={[textStyle('md'), styles.strong, { color: palette.ink }]}
          >
            {collector.displayName}
          </Text>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            {collector.publicLabel}
            {' · '}
            <Text testID="match-distance" style={[styles.strong, { color: palette.ink }]}>
              {collectorDistanceLabel(match.distanceBucket ?? collector.distanceBucket, false)}
            </Text>
          </Text>
          <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
            {ratingLabel(collector.rating)}
            {lastActive ? ` · ${lastActive}` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Dismiss the match from ${collector.displayName}`}
          disabled={dismissing}
          onPress={onDismiss}
          hitSlop={8}
          testID={`match-dismiss-${match.id}`}
        >
          <MaterialCommunityIcons name="close" size={22} color={palette.textMuted} />
        </Pressable>
      </View>

      <View style={styles.item}>
        <CardImage src={image} alt={name} game={item.card?.game} size="sm" />
        <View style={styles.grow}>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            <Text style={styles.mono}>{printingCode(item.printing)}</Text>
            {item.printing?.setName ? ` · ${item.printing.setName}` : ''}
          </Text>
          {details ? (
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{details}</Text>
          ) : null}
          <View style={styles.chips}>
            <Chip label={conditionLabel(item.condition)} tone="outline" />
            <Chip label={availabilityLabel(item.availability)} tone="teal" />
            {item.acceptsOffers ? <Chip label="Accepts offers" tone="violet" /> : null}
          </View>
          <Text
            testID="match-price"
            style={[textStyle('lg', 'heading'), styles.strong, { color: palette.ink }]}
          >
            {price ?? 'No price'}
          </Text>
          {item.freshness?.label ? (
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              {item.freshness.label}
            </Text>
          ) : null}
          {item.publicNotes ? (
            <Text style={[textStyle('sm'), styles.note, { color: palette.ink }]}>
              “{item.publicNotes}”
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          label={messaging ? 'Opening…' : 'Message'}
          icon="message-text-outline"
          onPress={onMessage}
          loading={messaging}
          testID={`match-message-${match.id}`}
        />
        <MakeOfferButton
          target={offerTargetFromItem(item, sellerFromMarker(collector))}
          testID={`match-offer-${match.id}`}
        />
        <Button
          label="View profile"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/collectors/[id]', params: { id: collector.handle } })
          }
        />
        {item.binder?.id ? (
          <Button
            label="View binder"
            icon="book-open-variant"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/binders/[id]', params: { id: item.binder?.id ?? '' } })
            }
          />
        ) : null}
        <Button
          label="On the map"
          icon="map-outline"
          variant="ghost"
          onPress={() => router.navigate({ pathname: '/', params: mapParamsFor(match) })}
          testID={`match-on-map-${match.id}`}
        />
      </View>
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
        Matched {relativeTime(match.matchedAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, borderWidth: 1 },
  who: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  online: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  grow: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], marginVertical: 2 },
  mono: { fontFamily: fontFamily.mono },
  note: { fontStyle: 'italic' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
});
