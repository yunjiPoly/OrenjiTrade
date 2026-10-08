import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCollectorWishlist } from '@/src/api/hooks/collectorWishlist';
import type { WishlistSummaryEntry } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { SectionCard } from '@/src/components/ui/Layout';
import { wishPrintingLabel } from '@/src/features/wishlist/wishlistLabels';
import { printingImageUrl } from '@/src/lib/catalog';
import { cardCount, conditionLabel } from '@/src/lib/inventory';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * "Looking for" on a collector's profile (the web's `app-collector-wishlist`): the public wishlist
 * of a collector who enabled "Show my wishlist on my profile": card, printing or any printing,
 * minimum condition. Never prices, radii or notes. Nothing is shown while it loads, when it is
 * hidden (404), empty or failed (the binders say the rest), like the web.
 */
export function CollectorWishlistSection({
  handle,
  displayName,
  isOwn,
}: {
  handle: string;
  displayName: string;
  isOwn: boolean;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const wishlist = useCollectorWishlist(handle);
  const entries = wishlist.data ?? [];
  if (entries.length === 0) {
    return null;
  }
  const open = (wish: WishlistSummaryEntry) => {
    if (!wish.card?.id) {
      return;
    }
    router.push({
      pathname: '/cards/[id]',
      params: { id: wish.card.id, ...(wish.printing?.id ? { printing: wish.printing.id } : {}) },
    });
  };
  return (
    <SectionCard title="Looking for" testID="collector-wishlist">
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
        {cardCount(entries.length)}
        {isOwn ? ' on your wishlist' : ` ${displayName} is looking for`}
      </Text>
      <View
        style={styles.list}
        accessibilityLabel={
          isOwn ? 'Cards you are looking for' : `Cards ${displayName} is looking for`
        }
      >
        {entries.map((wish, index) => {
          const name = wish.card?.name ?? 'Card';
          const printing = wishPrintingLabel(wish.printing);
          const condition = wish.conditionMin
            ? `${conditionLabel(wish.conditionMin)} or better`
            : null;
          return (
            <Pressable
              key={`${wish.card?.id ?? index}-${wish.printing?.id ?? 'any'}`}
              accessibilityRole="link"
              accessibilityLabel={`${name}, ${printing}${condition ? `, ${condition}` : ''}`}
              accessibilityHint="Opens the card"
              onPress={() => open(wish)}
              testID={`collector-wish-${wish.card?.id ?? index}`}
              style={({ pressed }) => [
                styles.row,
                { borderColor: palette.border, backgroundColor: palette.surface },
                pressed && styles.pressed,
              ]}
            >
              <CardImage
                src={printingImageUrl(wish.printing) ?? wish.card?.imageUrl ?? null}
                alt=""
                game={null}
                size="xs"
              />
              <View style={styles.text}>
                <Text
                  style={[textStyle('md'), styles.strong, { color: palette.ink }]}
                  numberOfLines={2}
                >
                  {name}
                </Text>
                <Text style={[textStyle('xs'), { color: palette.textMuted }]} numberOfLines={1}>
                  {printing}
                </Text>
                {condition ? (
                  <View style={styles.condition}>
                    <MaterialCommunityIcons
                      name="check-decagram-outline"
                      size={14}
                      color={palette.textMuted}
                    />
                    <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{condition}</Text>
                  </View>
                ) : null}
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={palette.textDisabled} />
            </Pressable>
          );
        })}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  text: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  condition: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pressed: { opacity: 0.8 },
});
