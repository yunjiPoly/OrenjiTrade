import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/ui/Text';
import { CardTyping } from '@/src/features/search/CardTyping';
import { SettingsTopBar } from '@/src/features/settings/SettingsPage';
import { PINNED_MAX_FONT_SCALE, spacing, useTheme } from '@/src/theme';

import { WISH_COPY as COPY } from './wishCopy';

/**
 * "Add a wish" (stage R14): the card search of Search (mockup v50 screen 12: the field "{game}
 * card name or code" with Cancel, the recent searches, the browsed game's cards with the typed part
 * in orange) under the line on what a wish does. Picking a card opens the wish form (screen 64,
 * `/wishlist/new?cardId=`), whose "Change" comes back here with the text still typed; the text goes
 * with the card, so a printing code typed picks that printing. Cancel and Back leave. `game` (the
 * link's) searches that game when it can be browsed, else the browsed game (stage G).
 */
export function WishCardSearch({ game = null }: { game?: string | null }) {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const leave = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace({ pathname: '/search', params: { segment: 'wishlist' } });
    }
  };
  return (
    <View
      testID="screen-wish-search"
      style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}
    >
      <Stack.Screen options={{ headerShown: false, title: COPY.searchTitle }} />
      <SettingsTopBar title={COPY.searchTitle} onBack={leave} backLabel={COPY.back} />
      <View style={[styles.body, { paddingBottom: insets.bottom }]}>
        {/* It stays above the field and follows the text size as little as the field's own
            controls: at the largest sizes it took 500 pt, and the field opened under the keyboard
            with one result in view (R14 review fix 1, U2). */}
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[styles.intro, { color: palette.textMuted }]}
          testID="wish-card-step"
        >
          {COPY.searchIntro}
        </Text>
        <CardTyping
          game={game}
          onCancel={leave}
          onPickCard={(card, typed) => {
            if (card.id) {
              router.push({
                pathname: '/wishlist/new',
                params: { cardId: card.id, code: typed, from: 'search' },
              });
            }
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { flex: 1, paddingHorizontal: spacing[4], paddingTop: spacing[3], gap: spacing[3] },
  intro: { fontSize: 14, lineHeight: 20 },
});
