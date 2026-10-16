import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useMyLocation } from '@/src/api/hooks/location';
import { useDeckCoresWithCard, useWhoHasThisCard } from '@/src/api/hooks/search';
import { useCreateWish, useDeleteWish, useWishlist } from '@/src/api/hooks/wishlist';
import type { CardDetail, CardHolderResult, PublicBinderSummary } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { CardDataCredit, CardImage } from '@/src/components/ui/CardImage';
import { ConfirmSheet } from '@/src/components/ui/ConfirmSheet';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { useMessageCollector } from '@/src/features/messages/useMessageCollector';
import { useBrowsingRegion } from '@/src/features/regions/browsingRegion';
import { regionName } from '@/src/lib/place';
import {
  PINNED_MAX_FONT_SCALE,
  TITLE_MAX_FONT_SCALE,
  fontFamily,
  fontWeight,
  radius,
  spacing,
  textStyle,
  useTheme,
} from '@/src/theme';

import { CARD_PAGE_COPY, gameName } from '../search/searchCopy';
import { groupHolders, type HolderGroup } from './holderGroups';
import { HolderRow } from './HolderRow';
import { printingOptions } from './printingOptions';
import { tcgplayerSearchUrl } from './tcgplayer';

export interface WhoHasThisCardProps {
  card: CardDetail;
  /** The printing the link named (`?printing=<id>`), or null for any printing. */
  initialPrinting: string | null;
}

/**
 * Who has this card, the one card page (owner spec 2026-10-14, section 8, mockup screen 13; it
 * replaces the card detail and the card holders list): back and the wishlist toggle; the picture,
 * the game in capitals, the name and "Check TCGplayer price" (TCGplayer's own search in the
 * browser: nothing is fetched from it or kept about it); "Any printing ▾" (a sheet of the card's
 * printings that filters the rows); "Also in a deck core" when public deck cores of the region hold
 * the card (at most 3, each opens its page); then the holders grouped by state or province, the
 * collector's own first ("Quebec · your province"), the newest listing first in each, with Message
 * pinning the card. No card text, no type line, no market price, no filters and no counts.
 */
export function WhoHasThisCard({ card, initialPrinting }: WhoHasThisCardProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { region } = useBrowsingRegion();
  // "Nobody in Americas (North) lists this card yet." (the region browsed, by its name).
  const where = regionName(region);
  const location = useMyLocation();
  const cardId = card.id ?? null;
  const name = card.name ?? 'Card';
  const options = useMemo(() => printingOptions(card.printings ?? []), [card.printings]);
  const known = (id: string | null) => !!id && options.some((option) => option.id === id);
  const [printing, setPrinting] = useState<string | null>(
    known(initialPrinting) ? initialPrinting : null
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const holders = useWhoHasThisCard(cardId, printing);
  const cores = useDeckCoresWithCard(cardId);
  const { message, startingId } = useMessageCollector();
  const rows = useMemo(
    () => holders.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [holders.data]
  );
  const mySubdivision = location.data?.location?.subdivisionCode ?? null;
  const sections = useMemo(
    () => groupHolders(rows, mySubdivision).map((group) => ({ ...group, data: group.rows })),
    [rows, mySubdivision]
  );
  const printingLabel = printing
    ? (options.find((option) => option.id === printing)?.label ?? CARD_PAGE_COPY.anyPrinting)
    : CARD_PAGE_COPY.anyPrinting;
  const back = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/search', params: {} });
  const openCore = (core: PublicBinderSummary) =>
    router.push({ pathname: '/binders/[id]', params: { id: core.id, view: 'public' } });
  const messageHolder = (result: CardHolderResult) =>
    void message(result.collector.id, { itemId: result.item.id });

  const header = (
    <View style={styles.header}>
      <View style={styles.hero}>
        <CardImage
          src={card.primaryImageUrl}
          alt={name}
          game={card.game}
          size="sm"
          testID="card-picture"
        />
        <View style={styles.heroText}>
          {card.game ? (
            <Text
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              style={[textStyle('xs'), styles.eyebrow, { color: palette.textMuted }]}
              testID="card-game"
            >
              {gameName(card.game).toUpperCase()}
            </Text>
          ) : null}
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
            style={[styles.name, { color: palette.ink }]}
            testID="card-name"
          >
            {name}
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={CARD_PAGE_COPY.tcgplayerLabel}
            onPress={() => void Linking.openURL(tcgplayerSearchUrl(card.game, name))}
            testID="card-tcgplayer"
            style={({ pressed }) => [
              styles.pill,
              { backgroundColor: palette.surface, borderColor: palette.borderStrong },
              pressed && styles.pressed,
            ]}
          >
            <Text
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              style={[textStyle('sm'), styles.bold, { color: palette.ink }]}
            >
              {CARD_PAGE_COPY.tcgplayer}
            </Text>
            <MaterialCommunityIcons name="open-in-new" size={16} color={palette.textMuted} />
          </Pressable>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${printingLabel}. ${CARD_PAGE_COPY.printingSheet}`}
        onPress={() => setSheetOpen(true)}
        testID="card-printing"
        style={({ pressed }) => [
          styles.pill,
          styles.printing,
          { backgroundColor: palette.surface, borderColor: palette.borderStrong },
          pressed && styles.pressed,
        ]}
      >
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          numberOfLines={1}
          style={[textStyle('sm'), styles.bold, styles.shrink, { color: palette.ink }]}
        >
          {printingLabel}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={18} color={palette.textMuted} />
      </Pressable>
      {cores.data && cores.data.length > 0 ? (
        <DeckCoreBanner cores={cores.data} onOpen={openCore} />
      ) : null}
    </View>
  );

  let empty;
  if (!holders.data && holders.error) {
    empty = (
      <ErrorState
        testID="holders-error"
        error={holders.error}
        title={CARD_PAGE_COPY.holdersError}
        onRetry={() => void holders.refetch()}
      />
    );
  } else if (!holders.data) {
    empty = <SkeletonList rows={4} rowHeight={68} testID="holders-loading" />;
  } else {
    empty = (
      <View style={styles.empty} testID="holders-empty">
        <Text style={[textStyle('md'), styles.center, { color: palette.textMuted }]}>
          {printing ? CARD_PAGE_COPY.emptyPrinting(where) : CARD_PAGE_COPY.empty(where)}
        </Text>
        <WishlistToggle card={card} testID="holders-empty-wishlist" />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={CARD_PAGE_COPY.back}
          onPress={back}
          // The id of the navigation header's back button: the flows go back the same way.
          testID="BackButton"
          hitSlop={6}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color={palette.ink} />
        </Pressable>
        <WishlistToggle card={card} testID="card-wishlist" />
      </View>
      <SectionList<CardHolderResult, HolderGroup & { data: CardHolderResult[] }>
        testID="holders-list"
        style={styles.fill}
        sections={holders.data ? sections : []}
        keyExtractor={(result) => result.item.id}
        renderSectionHeader={({ section }) => (
          <Text
            accessibilityRole="header"
            style={[
              textStyle('sm'),
              styles.bold,
              styles.group,
              { color: palette.textMuted, backgroundColor: palette.background },
            ]}
            testID={`holders-group-${section.key}`}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <HolderRow
            result={item}
            onMessage={messageHolder}
            starting={startingId === item.collector.id}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <View style={styles.footer}>
            {holders.data ? (
              <ListFooter
                loading={holders.isFetchingNextPage}
                failed={!!holders.error && holders.hasNextPage}
                onRetry={() => void holders.fetchNextPage()}
              />
            ) : null}
            {/* The picture's provider and the game's owner (ADR 0015). */}
            <CardDataCredit game={card.game} />
          </View>
        }
        onEndReached={() => {
          if (holders.hasNextPage && !holders.isFetchingNextPage && !holders.error) {
            void holders.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={!!holders.data && holders.isRefetching && !holders.isFetchingNextPage}
            onRefresh={() => {
              void holders.refetch();
              void cores.refetch();
            }}
          />
        }
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing[6] }]}
      />
      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={CARD_PAGE_COPY.printingSheet}
        testID="card-printing-sheet"
      >
        {[{ id: '', label: CARD_PAGE_COPY.anyPrinting }, ...options].map((option) => {
          const chosen = (printing ?? '') === option.id;
          return (
            <Pressable
              key={option.id || 'any'}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              aria-checked={chosen}
              onPress={() => {
                setPrinting(option.id || null);
                setSheetOpen(false);
              }}
              testID={`card-printing-${option.id || 'any'}`}
              style={({ pressed }) => [
                styles.option,
                { borderBottomColor: palette.border },
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  textStyle('md'),
                  styles.shrink,
                  option.id ? styles.mono : null,
                  { color: palette.ink },
                ]}
              >
                {option.label}
              </Text>
              {chosen ? (
                <MaterialCommunityIcons name="check" size={20} color={palette.primary} />
              ) : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    </View>
  );
}

/** "Also in a deck core": the public deck cores of the region that hold the card (at most 3). */
function DeckCoreBanner({
  cores: list,
  onOpen,
}: {
  cores: PublicBinderSummary[];
  onOpen: (core: PublicBinderSummary) => void;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: palette.deckCore.surface, borderColor: palette.deckCore.border },
      ]}
      testID="card-deck-cores"
    >
      <View
        style={[styles.bannerIcon, { backgroundColor: palette.deckCore.tagBackground }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <MaterialCommunityIcons name="cards-outline" size={20} color={palette.deckCore.tagText} />
      </View>
      <View style={styles.fill}>
        <Text style={[textStyle('md'), styles.bold, { color: palette.ink }]}>
          {CARD_PAGE_COPY.deckCoreBanner}
        </Text>
        {list.map((core) => {
          const line = CARD_PAGE_COPY.deckCoreLine(
            core.name,
            core.owner?.handle ?? '',
            core.owner?.place?.subdivisionName ?? null,
            core.askingPriceText
          );
          return (
            <Pressable
              key={core.id}
              accessibilityRole="link"
              accessibilityLabel={`${CARD_PAGE_COPY.deckCoreBanner}: ${line}`}
              onPress={() => onOpen(core)}
              testID={`card-deck-core-${core.id}`}
              style={({ pressed }) => [styles.bannerLine, pressed && styles.pressed]}
            >
              <Text style={[textStyle('sm'), styles.fill, { color: palette.textMuted }]}>
                {line}
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={palette.textDisabled} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The wishlist toggle of the card page: "Add to wishlist" adds an "Any printing" wish without
 * terms (the collector refines it in Search › Wishlist); "On your wishlist" (teal) asks before it
 * removes the card's wishes.
 */
function WishlistToggle({ card, testID }: { card: CardDetail; testID: string }) {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const wishlist = useWishlist();
  const create = useCreateWish();
  const remove = useDeleteWish();
  const [confirming, setConfirming] = useState(false);
  const name = card.name ?? 'This card';
  const wishes = (wishlist.data ?? []).filter((wish) => wish.card?.id === card.id);
  const on = wishes.length > 0;
  const busy = create.isPending || remove.isPending || !wishlist.data;

  const add = async () => {
    if (!card.id) {
      return;
    }
    try {
      await create.mutateAsync({ cardId: card.id });
      snackbar.show(CARD_PAGE_COPY.wishAdded(name), { duration: 5000 });
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error', duration: 6000 });
    }
  };
  const drop = async () => {
    try {
      for (const wish of wishes) {
        await remove.mutateAsync({ id: wish.id });
      }
      snackbar.show(CARD_PAGE_COPY.wishRemoved(name));
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error', duration: 6000 });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={on ? CARD_PAGE_COPY.onWishlist : CARD_PAGE_COPY.addToWishlist}
        aria-pressed={on}
        accessibilityState={{ selected: on, busy }}
        disabled={busy}
        onPress={() => (on ? setConfirming(true) : void add())}
        testID={testID}
        style={({ pressed }) => [
          styles.wish,
          on
            ? { backgroundColor: palette.accentContainer, borderColor: palette.accent }
            : { backgroundColor: palette.surface, borderColor: palette.borderStrong },
          pressed && styles.pressed,
        ]}
      >
        <MaterialCommunityIcons
          name={on ? 'star' : 'star-outline'}
          size={18}
          color={on ? palette.onAccentContainer : palette.ink}
        />
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[
            textStyle('sm'),
            styles.bold,
            { color: on ? palette.onAccentContainer : palette.ink },
          ]}
        >
          {on ? CARD_PAGE_COPY.onWishlist : CARD_PAGE_COPY.addToWishlist}
        </Text>
      </Pressable>
      <ConfirmSheet
        visible={confirming}
        title={`Remove ${name} from your wishlist?`}
        message="Its wish and the terms you chose go away. You can add it again later."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        busy={remove.isPending}
        onConfirm={() => void drop()}
        onCancel={() => setConfirming(false)}
        testID={`${testID}-remove`}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shrink: { flexShrink: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: spacing[2],
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  wish: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 44,
    paddingHorizontal: spacing[4],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  list: { paddingHorizontal: spacing[4] },
  header: { gap: spacing[4], paddingBottom: spacing[2] },
  hero: { flexDirection: 'row', gap: spacing[4], alignItems: 'flex-start' },
  heroText: { flex: 1, gap: spacing[2] },
  eyebrow: { fontWeight: fontWeight.semibold, letterSpacing: 0.8 },
  name: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: fontWeight.bold,
  },
  bold: { fontWeight: fontWeight.semibold },
  mono: { fontFamily: fontFamily.mono },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[2],
    minHeight: 44,
    paddingHorizontal: spacing[4],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  printing: { maxWidth: '100%' },
  banner: {
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerLine: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], minHeight: 44 },
  group: { paddingTop: spacing[4], paddingBottom: spacing[1] },
  empty: { gap: spacing[4], alignItems: 'center', paddingVertical: spacing[6] },
  footer: { gap: spacing[4], paddingTop: spacing[4] },
  center: { textAlign: 'center' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.75 },
});
