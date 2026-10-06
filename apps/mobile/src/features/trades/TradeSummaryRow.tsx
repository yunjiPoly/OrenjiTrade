import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TradeSummary } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { CardImage } from '@/src/components/ui/CardImage';
import { offerTermsText } from '@/src/features/offers/offerLabels';
import { StatusChip } from '@/src/features/offers/StatusChip';
import { printingCode, printingImageUrl } from '@/src/lib/catalog';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { isYourMove, nextActionShort, tradeStatusInfo } from './tradeLabels';

/**
 * One trade of the list (web: `app-trade-summary-row`): the card, the other collector (buyer or
 * seller), the terms, meetup / payment protection, the status and the next move.
 */
export const TradeSummaryRow = memo(function TradeSummaryRow({
  trade,
  onPress,
}: {
  trade: TradeSummary;
  onPress: (trade: TradeSummary) => void;
}) {
  const { palette } = useTheme();
  const item = trade.item;
  const image = item ? (item.images[0]?.url ?? printingImageUrl(item.printing)) : null;
  const code = printingCode(item?.printing);
  const status = tradeStatusInfo(trade.status);
  const mine = isYourMove(trade);
  const next = nextActionShort(
    trade.status,
    trade.nextAction,
    trade.viewerRole,
    trade.counterparty.displayName
  );
  const terms = offerTermsText({
    kind: trade.kind,
    cashAmount: trade.cashAmount,
    currency: trade.currency,
    cards: trade.tradeItemCount,
  });
  const label =
    `Trade of ${item?.card.name ?? 'a card'} with ${trade.counterparty.displayName}: ` +
    `${terms}, ${status.label}, ${next}`;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => onPress(trade)}
      testID={`trade-row-${trade.id}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.surface, borderColor: mine ? palette.primary : palette.border },
        pressed && styles.pressed,
      ]}
    >
      <CardImage src={image} alt="" game={item?.card.game} size="sm" />
      <View style={styles.main}>
        <Text numberOfLines={2} style={[textStyle('md'), styles.strong, { color: palette.ink }]}>
          {item?.card.name ?? 'Card no longer available'}
          {code ? <Text style={[styles.mono, { color: palette.textMuted }]}> {code}</Text> : null}
        </Text>
        <View style={styles.who}>
          <Avatar
            src={trade.counterparty.avatarUrl}
            name={trade.counterparty.displayName}
            size={18}
          />
          <Text
            numberOfLines={1}
            style={[textStyle('xs'), styles.grow, { color: palette.textMuted }]}
          >
            {trade.viewerRole === 'SELLER' ? 'With buyer' : 'With seller'}{' '}
            {trade.counterparty.displayName}
          </Text>
        </View>
        <Text style={[textStyle('sm'), { color: palette.ink }]}>
          <Text style={styles.strong}>{terms}</Text>
          {trade.meetup ? (
            <Text style={{ color: palette.textMuted }}> · In-person meetup</Text>
          ) : trade.protectionEnabled ? (
            <Text style={{ color: palette.textMuted }}> · Payment protection</Text>
          ) : null}
        </Text>
        <View style={styles.side}>
          <StatusChip info={status} testID={`trade-row-status-${trade.id}`} />
          <Text
            testID={`trade-row-next-${trade.id}`}
            style={[
              textStyle('xs'),
              mine && styles.strong,
              { color: mine ? palette.primary : palette.textMuted },
            ]}
          >
            {next}
          </Text>
        </View>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          {relativeTime(trade.updatedAt)}
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
  pressed: { opacity: 0.8 },
});
