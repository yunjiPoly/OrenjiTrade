import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { OfferSummary } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { CardImage } from '@/src/components/ui/CardImage';
import { printingCode, printingImageUrl } from '@/src/lib/catalog';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  expiryLabel,
  isLiveOffer,
  offerKindLabel,
  offerStatusInfo,
  offerTermsText,
} from './offerLabels';
import { StatusChip } from './StatusChip';

/** "CA$40.00" / "2 cards" of a summary. */
export function summaryTerms(offer: OfferSummary): string {
  return offerTermsText({
    kind: offer.kind,
    cashAmount: offer.cashAmount,
    currency: offer.currency,
    cards: offer.tradeItemCount,
  });
}

/**
 * One negotiation of the inbox (web: `app-offer-summary-row`): the card, who it is from / to
 * (place label only), the live terms, the status, "Your turn" or who is awaited, and the expiry.
 */
export const OfferSummaryRow = memo(function OfferSummaryRow({
  offer,
  onPress,
}: {
  offer: OfferSummary;
  onPress: (offer: OfferSummary) => void;
}) {
  const { palette } = useTheme();
  const item = offer.item;
  const image = item ? (item.images[0]?.url ?? printingImageUrl(item.printing)) : null;
  const code = printingCode(item?.printing);
  const status = offerStatusInfo(offer.status);
  const live = isLiveOffer(offer.status);
  const terms = summaryTerms(offer);
  const expiry = expiryLabel(offer.expiresAt);
  const card = item?.card.name ?? 'Card no longer available';
  const direction = offer.viewerRole === 'SELLER' ? 'From' : 'To';
  const label =
    `Offer on ${item?.card.name ?? 'a card'} ${direction.toLowerCase()} ` +
    `${offer.counterparty.displayName}: ${terms}, ${status.label}${offer.yourTurn ? ', your turn' : ''}`;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => onPress(offer)}
      testID={`offer-row-${offer.id}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: palette.surface,
          borderColor: offer.yourTurn ? palette.primary : palette.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <CardImage src={image} alt="" game={item?.card.game} size="sm" />
      <View style={styles.main}>
        <Text numberOfLines={2} style={[textStyle('md'), styles.strong, { color: palette.ink }]}>
          {card}
          {code ? <Text style={[styles.mono, { color: palette.textMuted }]}> {code}</Text> : null}
        </Text>
        <View style={styles.who}>
          <Avatar
            src={offer.counterparty.avatarUrl}
            name={offer.counterparty.displayName}
            size={18}
          />
          <Text
            numberOfLines={1}
            style={[textStyle('xs'), styles.grow, { color: palette.textMuted }]}
          >
            {direction} {offer.counterparty.displayName}
            {offer.counterparty.location?.publicLabel
              ? ` · ${offer.counterparty.location.publicLabel}`
              : ''}
          </Text>
        </View>
        <Text style={[textStyle('sm'), { color: palette.ink }]}>
          <Text style={{ color: palette.textMuted }}>{offerKindLabel(offer.kind)} · </Text>
          <Text style={styles.strong} testID={`offer-row-terms-${offer.id}`}>
            {terms}
          </Text>
        </Text>
        <View style={styles.side}>
          <StatusChip info={status} testID={`offer-row-status-${offer.id}`} />
          {offer.yourTurn ? (
            <View style={styles.turn} testID={`offer-row-turn-${offer.id}`}>
              <MaterialCommunityIcons name="bell-ring-outline" size={14} color={palette.primary} />
              <Text style={[textStyle('xs'), styles.strong, { color: palette.primary }]}>
                Your turn
              </Text>
            </View>
          ) : live ? (
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              Waiting for {offer.counterparty.displayName}
            </Text>
          ) : null}
        </View>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          {live && expiry ? expiry : relativeTime(offer.updatedAt)}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  main: { flex: 1, gap: spacing[1] },
  strong: { fontWeight: fontWeight.semibold },
  mono: { fontFamily: fontFamily.mono, fontWeight: 'normal' },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  grow: { flex: 1 },
  side: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  turn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pressed: { opacity: 0.8 },
});
