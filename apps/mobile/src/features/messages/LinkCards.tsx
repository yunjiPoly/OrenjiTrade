import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { BinderLink, CardLink, SharedItem } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { HandleText } from '@/src/components/ui/HandleText';
import { Text } from '@/src/components/ui/Text';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { OFFER_UNAVAILABLE_TEXT } from './messageText';

/**
 * A card or binder shared in a message or a community post (the web's `app-shared-link-card`):
 * thumbnail, name and a link to the card page (with the shared printing selected) or the public
 * binder. A card shared from the sender's inventory in a chat (stage R4, `item`) shows its code
 * and its price as typed (mockup screen 24).
 */
export function SharedLinkCard({
  card,
  item,
  binder,
  testID,
}: {
  card?: CardLink | null;
  item?: SharedItem | null;
  binder?: BinderLink | null;
  testID?: string;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  if (card) {
    const line = [card.printingCode, item?.askingPriceText].filter(Boolean).join(' · ');
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Card: ${card.name}${line ? `, ${line}` : ''}`}
        onPress={() =>
          router.push({
            pathname: '/cards/[id]',
            params: { id: card.cardId, printing: card.id },
          })
        }
        testID={testID ?? 'shared-card-link'}
        style={({ pressed }) => [
          styles.cardLink,
          { backgroundColor: palette.surface, borderColor: palette.borderStrong },
          pressed && styles.pressed,
        ]}
      >
        <CardImage src={card.imageUrl} alt="" size="xs" />
        <View style={styles.text}>
          <Text numberOfLines={1} style={[styles.cardName, { color: palette.ink }]}>
            {card.name}
          </Text>
          {line ? (
            <Text numberOfLines={1} style={[styles.cardLine, { color: palette.textMuted }]}>
              {line}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  }
  if (binder) {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Binder: ${binder.name} by @${binder.ownerHandle}`}
        onPress={() => router.push({ pathname: '/binders/[id]', params: { id: binder.id } })}
        testID={testID ?? 'shared-binder-link'}
        style={({ pressed }) => [
          styles.link,
          { backgroundColor: palette.surface, borderColor: palette.border },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.icon, { backgroundColor: palette.primaryContainer }]}>
          <MaterialCommunityIcons
            name="book-open-variant"
            size={22}
            color={palette.onPrimaryContainer}
          />
        </View>
        <View style={styles.text}>
          <Text style={[textStyle('xs'), styles.eyebrow, { color: palette.textMuted }]}>
            Public binder
          </Text>
          <Text numberOfLines={2} style={[textStyle('sm'), styles.name, { color: palette.ink }]}>
            {binder.name}
          </Text>
          <HandleText
            testID="binder-link-owner"
            style={[textStyle('xs'), { color: palette.textMuted }]}
          >
            by @{binder.ownerHandle}
          </HandleText>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={palette.textDisabled} />
      </Pressable>
    );
  }
  return null;
}

/**
 * An offer that a conversation still holds (an OFFER_LINK message, or the SYSTEM message the API
 * posted on an offer or trade update): offers, trades and protected payments left the phone (ADR
 * 0018), so it reads as one grey line and opens nothing. Old conversations keep their place.
 */
export function OfferUnavailableLine({ testID = 'offer-unavailable' }: { testID?: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.unavailable} testID={testID}>
      <MaterialCommunityIcons
        name="tag-off-outline"
        size={16}
        color={palette.textMuted}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{OFFER_UNAVAILABLE_TEXT}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 16,
    borderWidth: 1,
    width: 250,
    maxWidth: '100%',
  },
  cardName: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  cardLine: { fontSize: 12, lineHeight: 16 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 220,
  },
  icon: {
    width: 36,
    height: 50,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 1 },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontWeight: fontWeight.semibold },
  mono: { fontFamily: fontFamily.mono },
  unavailable: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing[1],
    paddingVertical: spacing[1],
  },
  pressed: { opacity: 0.8 },
});
