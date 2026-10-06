import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { OfferTradeItem, PublicInventoryItem } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { formatMoney, printingCode, printingImageUrl } from '@/src/lib/catalog';
import { availabilityLabel, conditionLabel } from '@/src/lib/inventory';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { OFFER_KIND_INFO, kindHasCards, kindHasCash, type OfferKind } from './offerLabels';

/** "You give" / "Devon gives". */
function gives(name: string): string {
  return name === 'You' ? 'You give' : `${name} gives`;
}

function imageOf(item: PublicInventoryItem): string | null {
  return item.images[0]?.url ?? printingImageUrl(item.printing);
}

/**
 * What each side gives (web: `app-deal-summary`): the seller's card (picture, printing, condition,
 * availability, asking price; it opens the card page) against the buyer's cash and / or cards
 * with quantities, then the proposing party's note.
 */
export function DealSummary({
  item,
  kind,
  cashAmount,
  currency,
  tradeItems,
  message,
  messageAuthor,
  sellerName,
  buyerName,
}: {
  item: PublicInventoryItem | null | undefined;
  kind: string;
  cashAmount?: number | null;
  currency?: string | null;
  tradeItems: readonly OfferTradeItem[];
  message?: string | null;
  messageAuthor?: string | null;
  sellerName: string;
  buyerName: string;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const info = OFFER_KIND_INFO[kind as OfferKind] ?? OFFER_KIND_INFO.CASH;
  const hasCash = kindHasCash(kind);
  const hasCards = kindHasCards(kind) && tradeItems.length > 0;
  const asking = item ? formatMoney(item.askingPrice, item.currency) : null;
  const openCard = (card: PublicInventoryItem) =>
    router.push({
      pathname: '/cards/[id]',
      params: card.printing.id
        ? { id: card.card.id, printing: card.printing.id }
        : { id: card.card.id },
    });

  return (
    <View style={styles.root} testID="deal-summary">
      <View
        style={[styles.side, { borderColor: palette.border, backgroundColor: palette.surface }]}
      >
        <Text style={[textStyle('xs'), styles.who, { color: palette.textMuted }]}>
          {gives(sellerName)}
        </Text>
        {item ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${item.card.name}, ${printingCode(item.printing)}, ${conditionLabel(item.condition)}. Opens the card.`}
            onPress={() => openCard(item)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            testID="deal-card"
          >
            <CardImage src={imageOf(item)} alt="" game={item.card.game} size="sm" />
            <View style={styles.grow}>
              <Text style={[textStyle('md'), styles.strong, { color: palette.ink }]}>
                {item.card.name}
              </Text>
              <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                <Text style={styles.mono}>{printingCode(item.printing)}</Text>
                {item.printing.setName ? ` · ${item.printing.setName}` : ''}
              </Text>
              <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                {conditionLabel(item.condition)} · {availabilityLabel(item.availability)}
              </Text>
              {asking ? (
                <Text style={[textStyle('xs'), { color: palette.textMuted }]}>Asking {asking}</Text>
              ) : null}
            </View>
          </Pressable>
        ) : (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            This card is no longer available.
          </Text>
        )}
      </View>

      <View style={styles.swap} accessibilityElementsHidden importantForAccessibility="no">
        <MaterialCommunityIcons name="swap-vertical" size={22} color={palette.textMuted} />
      </View>

      <View
        style={[
          styles.side,
          { borderColor: palette.primary, backgroundColor: palette.primaryContainer },
        ]}
      >
        <View style={styles.whoRow}>
          <Text
            style={[
              textStyle('xs'),
              styles.who,
              styles.grow,
              { color: palette.onPrimaryContainer },
            ]}
          >
            {gives(buyerName)}
          </Text>
          <MaterialCommunityIcons name={info.icon} size={16} color={palette.onPrimaryContainer} />
          <Text style={[textStyle('xs'), styles.strong, { color: palette.onPrimaryContainer }]}>
            {info.label}
          </Text>
        </View>
        {hasCash ? (
          <Text
            testID="deal-cash"
            style={[
              textStyle('2xl', 'heading'),
              styles.strong,
              { color: palette.onPrimaryContainer },
            ]}
          >
            {formatMoney(cashAmount, currency ?? undefined) ?? '—'}
          </Text>
        ) : null}
        {hasCards ? (
          <>
            {hasCash ? (
              <Text style={[textStyle('xs'), { color: palette.onPrimaryContainer }]}>plus</Text>
            ) : null}
            <View testID="deal-cards" style={styles.lines} accessibilityLabel="Cards in the deal">
              {tradeItems.map((line, index) => (
                <TradeItemLine
                  key={line.inventoryItemId ?? `gone-${index}`}
                  line={line}
                  onOpen={openCard}
                />
              ))}
            </View>
          </>
        ) : null}
      </View>

      {message ? (
        <View
          style={[styles.note, { backgroundColor: palette.surfaceVariant }]}
          testID="deal-message"
        >
          <MaterialCommunityIcons name="format-quote-open" size={18} color={palette.textMuted} />
          <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
            {message}
            {messageAuthor ? (
              <Text style={{ color: palette.textMuted }}> — {messageAuthor}</Text>
            ) : null}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function TradeItemLine({
  line,
  onOpen,
}: {
  line: OfferTradeItem;
  onOpen: (item: PublicInventoryItem) => void;
}) {
  const { palette } = useTheme();
  const card = line.item;
  if (!card) {
    return (
      <View style={styles.line}>
        <Text style={[textStyle('sm'), styles.grow, { color: palette.onPrimaryContainer }]}>
          Card no longer available
        </Text>
        <Text style={[textStyle('sm'), styles.strong, { color: palette.onPrimaryContainer }]}>
          ×{line.quantity}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${card.card.name}, ${line.quantity} ${line.quantity === 1 ? 'copy' : 'copies'}. Opens the card.`}
      onPress={() => onOpen(card)}
      style={({ pressed }) => [styles.line, pressed && styles.pressed]}
    >
      <CardImage src={imageOf(card)} alt="" game={card.card.game} size="xs" />
      <View style={styles.grow}>
        <Text style={[textStyle('sm'), styles.strong, { color: palette.onPrimaryContainer }]}>
          {card.card.name}
        </Text>
        <Text style={[textStyle('xs'), { color: palette.onPrimaryContainer }]}>
          <Text style={styles.mono}>{printingCode(card.printing)}</Text> ·{' '}
          {conditionLabel(card.condition)}
        </Text>
      </View>
      <Text style={[textStyle('sm'), styles.strong, { color: palette.onPrimaryContainer }]}>
        ×{line.quantity}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  side: { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], gap: spacing[2] },
  who: { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: fontWeight.semibold },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  card: { flexDirection: 'row', gap: spacing[3], alignItems: 'center' },
  grow: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  mono: { fontFamily: fontFamily.mono },
  swap: { alignItems: 'center' },
  lines: { gap: spacing[2] },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  note: {
    flexDirection: 'row',
    gap: spacing[2],
    borderRadius: radius.md,
    padding: spacing[3],
  },
  pressed: { opacity: 0.8 },
});
