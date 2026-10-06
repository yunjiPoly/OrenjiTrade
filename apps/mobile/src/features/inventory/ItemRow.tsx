import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { InventoryItemResponse, PublicInventoryItem } from '@/src/api/types';
import { Badge, type CardCondition } from '@/src/components/ui/Badge';
import { CardImage } from '@/src/components/ui/CardImage';
import { formatMoney, printingCode, printingImageUrl } from '@/src/lib/catalog';
import {
  availabilityLabel,
  badgeFreshness,
  conditionLabel,
  isKnownCondition,
  VISIBILITY_INFO,
} from '@/src/lib/inventory';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

type Item = InventoryItemResponse | PublicInventoryItem;

function isOwnItem(item: Item): item is InventoryItemResponse {
  return 'visibility' in item;
}

export interface ItemRowProps {
  item: Item;
  /** Opens the item (owner: the editor). Without it the row is not pressable (public cards). */
  onPress?: (item: Item) => void;
  /** A trailing action (e.g. "Remove from binder"). */
  action?: ReactNode;
  /** A full-width action under the card (e.g. "Make an offer" on public cards; it sets its own
   * margins, so a footer that renders nothing leaves no gap). */
  footer?: ReactNode;
  testID?: string;
}

/**
 * One inventory card: picture (API URL only), name, printing code and set, condition, copies,
 * asking price, the trade / sale intent and "accepts offers". The owner also sees visibility
 * and freshness (stale and hidden listings stand out); public rows show the public notes.
 */
export const ItemRow = memo(function ItemRow({
  item,
  onPress,
  action,
  footer,
  testID,
}: ItemRowProps) {
  const { palette } = useTheme();
  const own = isOwnItem(item);
  const name = item.card.name;
  const code = printingCode(item.printing);
  const price = formatMoney(item.askingPrice, item.currency);
  const freshness = item.freshness?.state;
  const condition = item.condition;
  const summary = [
    name,
    code,
    conditionLabel(condition),
    `${item.quantity} ${item.quantity === 1 ? 'copy' : 'copies'}`,
    availabilityLabel(item.availability),
    price,
    item.acceptsOffers ? 'accepts offers' : null,
    own ? VISIBILITY_INFO[item.visibility].label : null,
    own && freshness && freshness !== 'ACTIVE' ? item.freshness.label : null,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <>
      <CardImage src={printingImageUrl(item.printing)} alt="" game={item.card.game} size="sm" />
      <View style={styles.text}>
        <Text style={[textStyle('md'), styles.name, { color: palette.ink }]} numberOfLines={2}>
          {name}
        </Text>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]} numberOfLines={1}>
          <Text style={styles.mono}>{code}</Text>
          {item.printing.setName ? ` · ${item.printing.setName}` : ''}
        </Text>
        <View style={styles.badges}>
          {isKnownCondition(condition) ? (
            <Badge variant="condition" value={condition as CardCondition} />
          ) : (
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              {conditionLabel(condition)}
            </Text>
          )}
          <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
            ×{item.quantity}
          </Text>
          {price ? (
            <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>{price}</Text>
          ) : null}
        </View>
        <View style={styles.badges}>
          <Tag label={availabilityLabel(item.availability)} />
          {item.acceptsOffers ? <Tag label="Offers" tone="offers" /> : null}
          {own ? (
            <Tag
              label={VISIBILITY_INFO[item.visibility].label}
              icon={item.visibility === 'PRIVATE' ? 'lock-outline' : 'earth'}
            />
          ) : null}
          {own && freshness && freshness !== 'ACTIVE' ? (
            <Badge variant="freshness" value={badgeFreshness(freshness)} />
          ) : null}
        </View>
        {!own && item.publicNotes ? (
          <Text style={[textStyle('xs'), { color: palette.textMuted }]} numberOfLines={2}>
            “{item.publicNotes}”
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <View
      style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
      testID={testID ?? `item-${item.id}`}
    >
      <View style={styles.row}>
        {onPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={summary}
            accessibilityHint="Opens the card to edit it"
            onPress={() => onPress(item)}
            style={({ pressed }) => [styles.main, pressed && styles.pressed]}
          >
            {content}
          </Pressable>
        ) : (
          <View accessible accessibilityLabel={summary} style={styles.main}>
            {content}
          </View>
        )}
        {action}
      </View>
      {footer}
    </View>
  );
});

function Tag({
  label,
  icon,
  tone = 'neutral',
}: {
  label: string;
  icon?: 'lock-outline' | 'earth';
  tone?: 'neutral' | 'offers';
}) {
  const { palette } = useTheme();
  const color = tone === 'offers' ? palette.availability.offers : palette.textMuted;
  return (
    <View style={[styles.tag, { borderColor: tone === 'offers' ? color : palette.border }]}>
      {icon ? <MaterialCommunityIcons name={icon} size={12} color={color} /> : null}
      <Text style={[textStyle('xs'), { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing[1],
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[2],
  },
  text: { flex: 1, gap: 4 },
  name: { fontWeight: fontWeight.semibold },
  mono: { fontFamily: fontFamily.mono },
  strong: { fontWeight: fontWeight.semibold },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing[2] },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 1,
  },
  pressed: { opacity: 0.8 },
});
