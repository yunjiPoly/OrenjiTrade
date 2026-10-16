import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCard } from '@/src/api/hooks/catalog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Skeleton, SkeletonList } from '@/src/components/ui/Skeleton';
import { WhoHasThisCard } from '@/src/features/cards/WhoHasThisCard';
import { CARD_PAGE_COPY } from '@/src/features/search/searchCopy';
import { ANY_PRINTING_PARAM } from '@/src/lib/catalog';
import { radius, spacing, useTheme } from '@/src/theme';

/**
 * The card page, Who has this card (owner spec 2026-10-14, sections 4 and 8; mockup screen 13):
 * one page for the card and its holders since stage R5 (the card detail and the card holders list
 * of before are gone; `/holders` links land here). Deep-link target:
 * https://www.orenjitrade.com/cards/<id> and orenjitrade://cards/<id>. `?printing=<id>` (a
 * wishlist alert, an "Available" wish) starts on that printing; `?printing=any` and `?rarity=`
 * start on "Any printing".
 */
export default function CardScreen() {
  const { id, printing } = useLocalSearchParams<{ id: string; printing?: string }>();
  const card = useCard(id);
  const notFound =
    !!card.error && (card.error.status === 404 || card.error.errorCode === 'VALIDATION_FAILED');
  const initialPrinting = printing && printing !== ANY_PRINTING_PARAM ? printing : null;

  if (card.data) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, title: card.data.name ?? 'Card' }} />
        <View testID="screen-card" style={styles.fill}>
          <WhoHasThisCard card={card.data} initialPrinting={initialPrinting} />
        </View>
      </>
    );
  }
  return (
    <Frame>
      {notFound ? (
        <CardNotFound />
      ) : card.error ? (
        <ErrorState
          testID="card-error"
          error={card.error}
          title={CARD_PAGE_COPY.error}
          onRetry={() => void card.refetch()}
        />
      ) : (
        <View
          testID="card-loading"
          accessibilityLabel={CARD_PAGE_COPY.loading}
          aria-busy
          style={styles.loading}
        >
          <View style={styles.hero}>
            <Skeleton width={56} height={78} radius={radius.sm} />
            <View style={styles.fill}>
              <Skeleton width="30%" height={12} />
              <Skeleton width="80%" height={24} style={styles.gap} />
              <Skeleton width="55%" height={36} style={styles.gap} />
            </View>
          </View>
          <SkeletonList rows={4} rowHeight={68} />
        </View>
      )}
    </Frame>
  );
}

/** The page's top row (back) around its loading, error and not-found states. */
function Frame({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="screen-card"
      style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}
    >
      <Stack.Screen options={{ headerShown: false, title: 'Card' }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={CARD_PAGE_COPY.back}
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace({ pathname: '/search', params: {} })
        }
        testID="BackButton"
        style={styles.back}
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color={palette.ink} />
      </Pressable>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

function CardNotFound() {
  const router = useRouter();
  return (
    <EmptyState
      testID="card-not-found"
      icon="cards-outline"
      title={CARD_PAGE_COPY.notFound}
      description={CARD_PAGE_COPY.notFoundHint}
      actionLabel={CARD_PAGE_COPY.searchCards}
      onAction={() => router.replace({ pathname: '/search', params: { typing: '1' } })}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing[3],
    marginTop: spacing[2],
  },
  body: { flex: 1, paddingHorizontal: spacing[4] },
  loading: { gap: spacing[4], paddingTop: spacing[3] },
  hero: { flexDirection: 'row', gap: spacing[4] },
  gap: { marginTop: spacing[2] },
});
