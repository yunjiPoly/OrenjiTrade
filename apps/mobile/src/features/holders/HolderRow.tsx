import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CardHolderResult } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Badge, type CardCondition } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { MakeOfferButton } from '@/src/features/offers/MakeOfferButton';
import { offerTargetFromItem, sellerFromMarker } from '@/src/features/offers/offerTarget';
import {
  editionLabel,
  formatMoney,
  languageName,
  printingCode,
  printingImageUrl,
} from '@/src/lib/catalog';
import { distanceBucketLabel } from '@/src/lib/formatDistanceBucket';
import {
  availabilityLabel,
  badgeFreshness,
  conditionLabel,
  isKnownCondition,
} from '@/src/lib/inventory';
import { GENERIC_AREA_LABEL, placeLabel } from '@/src/lib/location';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * One "who near me has this card" result (the web's `app-holder-row`): the listed copy (picture,
 * printing, set, language, edition, copies, condition, availability, offers, public note, price,
 * freshness) and its holder (name, approximate place and the API's distance bucket only), with
 * "Make an offer" when the copy accepts one and "View binder" when it sits in a public binder.
 */
export const HolderRow = memo(function HolderRow({ result }: { result: CardHolderResult }) {
  const { palette } = useTheme();
  const router = useRouter();
  const { collector, item } = result;
  const code = printingCode(item.printing);
  const price =
    formatMoney(item.askingPrice ?? null, item.currency) ??
    (item.acceptsOffers ? 'Make an offer' : 'No price');
  const place = placeLabel(collector.publicLabel) ?? GENERIC_AREA_LABEL;
  const distance = distanceBucketLabel(collector.distanceBucket);
  const meta = [item.printing.setName, languageName(item.language), editionLabel(item.edition)]
    .filter((part) => part && part !== '—')
    .join(' · ');
  return (
    <View
      testID={`holder-${item.id}`}
      accessibilityLabel={`${collector.displayName}, ${code}`}
      style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <View style={styles.row}>
        <CardImage
          src={item.images[0]?.url ?? printingImageUrl(item.printing)}
          alt=""
          game={item.card.game}
          size="sm"
        />
        <View style={styles.text}>
          <Text style={[textStyle('sm'), styles.mono, styles.strong, { color: palette.ink }]}>
            {code}
          </Text>
          <Text style={[textStyle('xs'), { color: palette.textMuted }]} numberOfLines={2}>
            {meta}
            {item.quantity > 1 ? ` · ×${item.quantity}` : ''}
          </Text>
          <View style={styles.badges}>
            {isKnownCondition(item.condition) ? (
              <Badge variant="condition" value={item.condition as CardCondition} />
            ) : (
              <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                {conditionLabel(item.condition)}
              </Text>
            )}
            <Tag label={availabilityLabel(item.availability)} />
            {item.acceptsOffers ? <Tag label="Offers" tone="offers" /> : null}
            <Badge variant="freshness" value={badgeFreshness(item.freshness.state)} />
          </View>
          {item.publicNotes ? (
            <Text style={[textStyle('xs'), styles.note, { color: palette.textMuted }]}>
              “{item.publicNotes}”
            </Text>
          ) : null}
        </View>
        <Text
          testID={`holder-${item.id}-price`}
          style={[textStyle('lg', 'heading'), styles.strong, { color: palette.ink }]}
        >
          {price}
        </Text>
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${collector.displayName}, ${place}${distance ? `, ${distance}` : ''}. Opens their profile.`}
        onPress={() =>
          router.push({ pathname: '/collectors/[id]', params: { id: collector.handle } })
        }
        testID={`holder-${item.id}-collector`}
        style={({ pressed }) => [styles.owner, pressed && styles.pressed]}
      >
        <Avatar src={collector.avatarUrl} name={collector.displayName} size={32} />
        <View style={styles.grow}>
          <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]} numberOfLines={1}>
            {collector.displayName}
          </Text>
          <Text style={[textStyle('xs'), { color: palette.textMuted }]} numberOfLines={1}>
            {place}
            {distance ? ` · ${distance}` : ''}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={palette.textDisabled} />
      </Pressable>
      <View style={styles.actions}>
        <MakeOfferButton
          target={offerTargetFromItem(item, sellerFromMarker(collector))}
          style={styles.action}
        />
        {item.binder ? (
          <Button
            label="View binder"
            icon="book-open-variant"
            variant="ghost"
            onPress={() =>
              router.push({
                pathname: '/binders/[id]',
                params: { id: item.binder?.id ?? '', view: 'public' },
              })
            }
            style={styles.action}
            testID={`holder-${item.id}-binder`}
          />
        ) : null}
      </View>
    </View>
  );
});

function Tag({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'offers' }) {
  const { palette } = useTheme();
  const color = tone === 'offers' ? palette.availability.offers : palette.textMuted;
  return (
    <View style={[styles.tag, { borderColor: tone === 'offers' ? color : palette.border }]}>
      <Text style={[textStyle('xs'), { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 1, padding: spacing[3], gap: spacing[2] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  text: { flex: 1, gap: 4 },
  mono: { fontFamily: fontFamily.mono },
  strong: { fontWeight: fontWeight.semibold },
  note: { fontStyle: 'italic' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing[1] },
  tag: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 1,
  },
  owner: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  grow: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  action: { flexGrow: 1, minHeight: 40, paddingVertical: spacing[2] },
  pressed: { opacity: 0.8 },
});
