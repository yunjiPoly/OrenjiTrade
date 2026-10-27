import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '@/src/account/AccountProvider';
import type { PublicBinderResponse } from '@/src/api/types';
import { PillButton } from '@/src/components/ui/PillButton';
import { Text } from '@/src/components/ui/Text';
import { useMessageCollector } from '@/src/features/messages/useMessageCollector';
import { reportParams } from '@/src/features/reports/reportLabels';
import { gameLabel } from '@/src/lib/profile';
import {
  fontFamily,
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  spacing,
  TITLE_MAX_FONT_SCALE,
  useTheme,
} from '@/src/theme';
import { useGuestAction } from '@/src/account/guestAction';
import { GUEST_COPY } from '@/src/features/guest/guestCopy';

import { DECK_CORE_COPY } from './binderCopy';
import { DeckCoreTag } from './BinderRows';
import { PHOTO_PAGER_HEIGHT, PhotoPager } from './PhotoPager';
import { SellerRow } from './SellerRow';

export interface DeckCorePageProps {
  binder: PublicBinderResponse;
  refreshing: boolean;
  onRefresh: () => void;
}

/**
 * The deck core page, what buyers see (owner spec 2026-10-14, section 7, mockup screen 16): the
 * photos full width with their dots and "1 / 3", the back button over them; the purple tag "Deck
 * core", the game, the name and the price in large type; the seller row ("{province} · {n} public
 * binders", opens the profile); the note; "Key cards" as chips "{card} ×{n}" (a chip opens the card
 * page; "Who has this card" comes with stage R5); and the fixed button "Message {handle}", which
 * opens the chat with the seller about this deck core (its pinned bar, stage R4). The owner sees
 * "Edit binder" instead. The back button stays put while the page scrolls, and once the photos
 * have gone under the status bar a band of the page's colour keeps the text from running under the
 * clock (R8's review U3: at the largest text size the back button scrolled away with the photos).
 */
export function DeckCorePage({ binder, refreshing, onRefresh }: DeckCorePageProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const selfId = useAccount().me?.id ?? null;
  const { message, startingId } = useMessageCollector();
  const owner = binder.owner;
  // Never "own" for a guest: they read no owner id (stage R15).
  const own = selfId !== null && owner.id === selfId;
  const photos = (binder.photos ?? []).map((photo) => photo.url);
  const pictures = photos.length > 0 ? photos : (binder.previewImages ?? []);
  const game = binder.games[0] ? gameLabel(binder.games[0]).toUpperCase() : null;
  const price = binder.askingPriceText?.trim() || null;
  const keyCards = binder.keyCards ?? [];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const [underStatusBar, setUnderStatusBar] = useState(false);
  const onScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const past = nativeEvent.contentOffset.y > PHOTO_PAGER_HEIGHT - insets.top;
    if (past !== underStatusBar) {
      setUnderStatusBar(past);
    }
  };
  // Opened from Edit binder (its eye button): "Edit binder" goes back to it rather than opening a
  // second one over it, which would leave the first one with old values.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const edit = () => {
    if (from === 'edit' && router.canGoBack()) {
      router.back();
    } else {
      router.push({ pathname: '/binders/edit', params: { id: binder.id } });
    }
  };

  return (
    <View testID="deck-core-page" style={[styles.fill, { backgroundColor: palette.background }]}>
      <Stack.Screen options={{ headerShown: false, title: binder.name }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onScroll={onScroll}
        scrollEventThrottle={32}
        testID="deck-core-scroll"
      >
        <PhotoPager
          urls={pictures}
          fit={photos.length > 0 ? 'cover' : 'contain'}
          topInset={insets.top}
        />

        <View style={styles.body}>
          <View style={styles.titleBlock}>
            <View style={styles.tagRow}>
              <DeckCoreTag label={DECK_CORE_COPY.tag} size="regular" testID="deck-core-tag" />
              {game ? (
                <Text
                  maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                  style={[styles.game, { color: palette.textMuted }]}
                >
                  {game}
                </Text>
              ) : null}
            </View>
            <View style={styles.nameRow}>
              <Text
                accessibilityRole="header"
                maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
                testID="deck-core-name"
                style={[styles.name, { color: palette.ink }]}
              >
                {binder.name}
              </Text>
              {price ? (
                <Text
                  maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
                  testID="deck-core-price"
                  style={[styles.price, { color: palette.ink }]}
                >
                  {price}
                </Text>
              ) : null}
            </View>
          </View>

          <SellerRow
            owner={owner}
            binderId={binder.id}
            publicBinders={binder.ownerPublicBinderCount ?? 1}
            testID="deck-core-seller"
          />

          {binder.description ? (
            <Text testID="deck-core-note" style={[styles.note, { color: palette.ink }]}>
              {binder.description}
            </Text>
          ) : null}

          {keyCards.length > 0 ? (
            <View style={styles.keyCards}>
              <Text
                accessibilityRole="header"
                style={[styles.keyCardsTitle, { color: palette.textMuted }]}
              >
                {DECK_CORE_COPY.keyCards}
              </Text>
              <View style={styles.chips}>
                {keyCards.map((card) => (
                  <Pressable
                    key={card.cardId}
                    accessibilityRole="link"
                    accessibilityLabel={DECK_CORE_COPY.keyCardLabel(card.name, card.quantity)}
                    onPress={() =>
                      router.push({ pathname: '/cards/[id]', params: { id: card.cardId } })
                    }
                    // 44 pt to touch, the chip drawn as the mockup's (about 32 pt).
                    hitSlop={6}
                    testID={`deck-core-card-${card.cardId}`}
                    style={({ pressed }) => [
                      styles.chip,
                      { backgroundColor: palette.surface, borderColor: palette.border },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.chipLabel, { color: palette.ink }]}>
                      {card.name}{' '}
                      <Text style={{ color: palette.textMuted }}>
                        {DECK_CORE_COPY.keyCardCopies(card.quantity)}
                      </Text>
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {own ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={DECK_CORE_COPY.reportLabel(
                owner.displayName || owner.handle || GUEST_COPY.aCollector
              )}
              onPress={() => {
                const ownerId = owner.id;
                if (!ownerId) {
                  useGuestAction.getState().open({ kind: 'report', binderId: binder.id });
                  return;
                }
                router.push({
                  pathname: '/report',
                  params: reportParams(
                    { id: ownerId, displayName: owner.displayName ?? '', handle: owner.handle },
                    { source: 'BINDER', binderId: binder.id }
                  ),
                });
              }}
              testID="deck-core-report"
              style={({ pressed }) => [styles.report, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="flag-outline" size={16} color={palette.textMuted} />
              <Text style={[styles.reportLabel, { color: palette.textMuted }]}>
                {DECK_CORE_COPY.report}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {underStatusBar ? (
        <View
          pointerEvents="none"
          testID="deck-core-status-band"
          style={[
            styles.statusBand,
            {
              height: insets.top,
              backgroundColor: palette.background,
              borderBottomColor: palette.border,
            },
          ]}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={DECK_CORE_COPY.backLabel}
        onPress={back}
        // The id of the navigation header's back button: the flows go back the same way.
        testID="BackButton"
        style={({ pressed }) => [styles.back, { top: insets.top + 10 }, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="chevron-left" size={26} color="#F5F5F4" />
      </Pressable>

      <View
        style={[
          styles.bar,
          {
            borderTopColor: palette.border,
            backgroundColor: palette.background,
            paddingBottom: Math.max(insets.bottom, spacing[4]),
          },
        ]}
      >
        {own ? (
          <PillButton
            label={DECK_CORE_COPY.editOwn}
            icon="pencil-outline"
            onPress={edit}
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            testID="deck-core-edit"
          />
        ) : (
          <PillButton
            label={owner.handle ? DECK_CORE_COPY.message(owner.handle) : GUEST_COPY.messageButton}
            accessibilityHint={owner.id ? undefined : GUEST_COPY.needsAccount}
            icon="message-outline"
            loading={!!owner.id && startingId === owner.id}
            // The chat opens about this deck core (stage R4: the pinned bar and the buying tip). A
            // guest is asked to sign in first, and the chat opens after (stage R15).
            onPress={() => {
              const ownerId = owner.id;
              if (!ownerId) {
                useGuestAction
                  .getState()
                  .open({ kind: 'message', listing: { binderId: binder.id } });
                return;
              }
              void message(ownerId, { binderId: binder.id });
            }}
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            testID="deck-core-message"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingBottom: spacing[6] },
  statusBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: {
    position: 'absolute',
    left: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(20, 18, 16, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: spacing[4], paddingTop: spacing[4], gap: 14 },
  titleBlock: { gap: 6 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  game: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold, letterSpacing: 0.6 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  name: {
    flexShrink: 1,
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
  },
  price: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: fontWeight.bold,
  },
  note: { fontSize: 15, lineHeight: 22 },
  keyCards: { gap: 8 },
  keyCardsTitle: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipLabel: { fontSize: 13, lineHeight: 18 },
  report: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    alignSelf: 'flex-start',
  },
  reportLabel: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  bar: {
    paddingHorizontal: spacing[4],
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.8 },
});
