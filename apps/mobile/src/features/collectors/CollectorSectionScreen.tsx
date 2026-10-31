import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { useAccount } from '@/src/account/AccountProvider';
import { useMyBlocks } from '@/src/api/hooks/blocks';
import {
  useCollectorBinders,
  useCollectorProfile,
  useCollectorPublicItemPages,
} from '@/src/api/hooks/collectors';
import { useCollectorWishlist } from '@/src/api/hooks/collectorWishlist';
import type { PublicBinderSummary, PublicInventoryItem } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { deckCoreTag } from '@/src/features/binders/binderCopy';
import { CardFan, CoreThumb, DeckCoreTag } from '@/src/features/binders/BinderRows';
import { itemPriceText } from '@/src/features/inventory/itemPrice';
import { CARD_PAGE_COPY } from '@/src/features/search/searchCopy';
import { printingCode, printingImageUrl } from '@/src/lib/catalog';
import { fontFamily, fontWeight, spacing, useStackedRows, useTheme } from '@/src/theme';

import { useUnblockCollector } from './BlockCollectorDialog';
import { CollectorRatingsSection } from './CollectorRatingsSection';
import { PROFILE_COPY } from './profileCopy';
import { deckCoresFirst } from './profileRules';
import { WishRow, wishRowFromSummary } from './ProfileSections';
import { useIHaveIt } from './useIHaveIt';

export type CollectorSection = 'cards' | 'binders' | 'wishes' | 'references';

/**
 * The "See all" pages of another collector's profile (owner spec 2026-10-14, section 9): every
 * public card (pages of 24, a card opens Who has this card on that printing), every public binder
 * and deck core (a row opens it), every public wish (with "I have it"), and every rating and
 * reference (the full section: the breakdown, "Rate this collector" after a deal or a real
 * conversation, "Write a reference"). The same visibility as the profile: a hidden or blocked
 * collector's lists answer 404, shown as "not available". Ratings and references answer for a
 * blocked pair (today's rule), so their page applies the profile's rule itself: a collector who
 * blocked you is "not available", one you blocked shows Unblock instead.
 */
export function CollectorSectionScreen({
  section,
  handle,
}: {
  section: CollectorSection;
  handle: string;
}) {
  switch (section) {
    case 'cards':
      return <CardsList handle={handle} />;
    case 'binders':
      return <BindersList handle={handle} />;
    case 'wishes':
      return <WishesList handle={handle} />;
    case 'references':
      return <ReferencesPage handle={handle} />;
  }
}

/** The title of a "See all" page: "Cards · duelist_jp". */
export function sectionTitle(section: CollectorSection, handle: string): string {
  const name = {
    cards: PROFILE_COPY.cards,
    binders: PROFILE_COPY.binders,
    wishes: PROFILE_COPY.lookingFor,
    references: PROFILE_COPY.ratings,
  }[section];
  return handle ? `${name} · ${handle}` : name;
}

function States({
  error,
  onRetry,
  testID,
  notAvailable = false,
}: {
  error: ApiError | null;
  onRetry: () => void;
  testID: string;
  /** Not available whatever the answer (a collector who blocked you). */
  notAvailable?: boolean;
}): ReactNode {
  const router = useRouter();
  if (notAvailable || error?.status === 404) {
    return (
      <EmptyState
        testID={`${testID}-not-found`}
        icon="account-off-outline"
        title={PROFILE_COPY.notAvailableTitle}
        description={PROFILE_COPY.notAvailableBody}
        actionLabel={PROFILE_COPY.notAvailableAction}
        onAction={() => router.navigate('/search')}
      />
    );
  }
  if (error) {
    return (
      <ErrorState
        testID={`${testID}-error`}
        error={error}
        title={PROFILE_COPY.loadError}
        onRetry={onRetry}
      />
    );
  }
  return <SkeletonList rows={4} rowHeight={72} testID={`${testID}-loading`} />;
}

/** One public card of the list: picture, name, "{code} · {rarity}", the price as typed, copies. */
function PublicCardRow({ item, onPress }: { item: PublicInventoryItem; onPress: () => void }) {
  const { palette } = useTheme();
  const stacked = useStackedRows();
  const line = CARD_PAGE_COPY.printingLine(printingCode(item.printing), item.printing.rarity);
  const price = itemPriceText(item);
  const copies = item.quantity === 1 ? '1 copy' : `${item.quantity} copies`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[item.card.name, line, price, copies].filter(Boolean).join(', ')}
      accessibilityHint={PROFILE_COPY.openCardHint}
      onPress={onPress}
      testID={`collector-all-card-${item.id}`}
      style={({ pressed }) => [
        styles.row,
        stacked && styles.rowStacked,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <CardImage src={printingImageUrl(item.printing)} alt="" game={item.card.game} size="xs" />
      <View style={styles.rowText}>
        <Text style={[styles.rowName, { color: palette.ink }]}>{item.card.name}</Text>
        <Text style={[styles.rowLine, styles.mono, { color: palette.textMuted }]}>{line}</Text>
      </View>
      <View style={[styles.price, stacked && styles.priceStacked]}>
        {price ? (
          <Text style={[styles.rowName, { color: palette.ink }]} numberOfLines={2}>
            {price}
          </Text>
        ) : null}
        <Text style={[styles.rowLine, { color: palette.textMuted }]}>{`×${item.quantity}`}</Text>
      </View>
    </Pressable>
  );
}

function CardsList({ handle }: { handle: string }) {
  const router = useRouter();
  const pages = useCollectorPublicItemPages(handle);
  const items = pages.data?.pages.flatMap((page) => page.items ?? []) ?? [];
  // A 404 wins over cached rows: a collector who blocked you (or was blocked, or hid their
  // profile) since the last visit stays hidden although the cache still holds their cards.
  if (!pages.data || pages.error?.status === 404) {
    return (
      <View style={styles.padded}>
        <States
          error={pages.error}
          onRetry={() => void pages.refetch()}
          testID="collector-cards-page"
        />
      </View>
    );
  }
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      testID="collector-cards-page"
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <PublicCardRow
          item={item}
          onPress={() =>
            router.push({
              pathname: '/cards/[id]',
              params: { id: item.card.id, printing: item.printing.id },
            })
          }
        />
      )}
      ListEmptyComponent={<EmptyState icon="cards-outline" title={PROFILE_COPY.emptyCards.other} />}
      onEndReached={() => {
        if (pages.hasNextPage && !pages.isFetchingNextPage) {
          void pages.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        <ListFooter
          loading={pages.isFetchingNextPage}
          failed={pages.isFetchNextPageError}
          onRetry={() => void pages.fetchNextPage()}
        />
      }
    />
  );
}

/** One public binder or deck core of the list (the rows of Search › Binders, without owner). */
function BinderListRow({ binder, onPress }: { binder: PublicBinderSummary; onPress: () => void }) {
  const { palette } = useTheme();
  const core = binder.sellsAsCore;
  const line = core ? null : PROFILE_COPY.cardCount(binder.itemCount);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[binder.name, core ? deckCoreTag(binder.askingPriceText) : line]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      testID={`collector-all-binder-${binder.id}`}
      style={({ pressed }) => [
        styles.row,
        core
          ? { backgroundColor: palette.deckCore.surface, borderColor: palette.deckCore.border }
          : { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      {core ? (
        <CoreThumb url={binder.previewImages?.[0]} />
      ) : (
        <CardFan urls={binder.previewImages ?? []} />
      )}
      <View style={styles.rowText}>
        <Text style={[styles.rowName, { color: palette.ink }]}>{binder.name}</Text>
        {core ? (
          <DeckCoreTag label={deckCoreTag(binder.askingPriceText)} />
        ) : (
          <Text style={[styles.rowLine, { color: palette.textMuted }]}>{line}</Text>
        )}
      </View>
    </Pressable>
  );
}

function BindersList({ handle }: { handle: string }) {
  const router = useRouter();
  const binders = useCollectorBinders(handle);
  // As for the cards: a 404 wins over the cached binders.
  if (!binders.data || binders.error?.status === 404) {
    return (
      <View style={styles.padded}>
        <States
          error={binders.error}
          onRetry={() => void binders.refetch()}
          testID="collector-binders-page"
        />
      </View>
    );
  }
  return (
    <FlatList
      data={deckCoresFirst(binders.data)}
      keyExtractor={(binder) => binder.id}
      testID="collector-binders-page"
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <BinderListRow
          binder={item}
          onPress={() => router.push({ pathname: '/binders/[id]', params: { id: item.id } })}
        />
      )}
      ListEmptyComponent={
        <EmptyState icon="book-open-variant" title={PROFILE_COPY.emptyBinders.other} />
      }
    />
  );
}

function WishesList({ handle }: { handle: string }) {
  const profile = useCollectorProfile(handle);
  const own = useAccount().me?.id === profile.data?.id;
  const wishes = useCollectorWishlist(handle);
  const { haveIt, busyKey } = useIHaveIt();
  const data = profile.data;
  // A hidden wishlist answers 404 like an empty one, so the profile decides: a blocked pair (either
  // way) or a profile that answers 404 is "not available", even over cached wishes.
  const blocked = !!data && !own && data.isBlocked;
  if (!wishes.data || !data || blocked || profile.error?.status === 404) {
    return (
      <View style={styles.padded}>
        <States
          notAvailable={blocked}
          error={profile.error ?? wishes.error}
          onRetry={() => {
            void profile.refetch();
            void wishes.refetch();
          }}
          testID="collector-wishes-page"
        />
      </View>
    );
  }
  const rows = wishes.data.flatMap((entry, index) => wishRowFromSummary(entry, index) ?? []);
  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      testID="collector-wishes-page"
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <WishRow
          entry={item}
          own={false}
          handle={data.handle}
          busy={busyKey === item.key}
          canHave={!own && data.canMessage}
          onHave={() =>
            void haveIt(
              data.id,
              {
                cardId: item.cardId,
                cardName: item.cardName,
                printing: item.printing,
                rarity: item.rarity,
              },
              item.key
            )
          }
          onEdit={() => undefined}
        />
      )}
      ListEmptyComponent={
        <EmptyState icon="heart-outline" title={PROFILE_COPY.emptyWishes.other} />
      }
    />
  );
}

function ReferencesPage({ handle }: { handle: string }) {
  const profile = useCollectorProfile(handle);
  const blocks = useMyBlocks();
  const unblocking = useUnblockCollector();
  const me = useAccount().me;
  const data = profile.data ?? null;
  const own = !!data && me?.id === data.id;
  // The profile's rule for a block (app/collectors/[id]/index.tsx): you see a collector you
  // blocked with Unblock, a collector who blocked you as "not available"; a block whose direction
  // is not known (your blocks could not load) shows nothing either.
  const blocked = !!data && !own && data.isBlocked;
  const blockedByMe = blocked && !!blocks.data?.some((b) => b.id === data.id);
  const waitingForBlocks = blocked && !blocks.data && !blocks.error;
  if (!data || waitingForBlocks || (blocked && !blockedByMe)) {
    return (
      <View style={styles.padded}>
        <States
          error={profile.error}
          notAvailable={blocked && !waitingForBlocks}
          onRetry={() => void profile.refetch()}
          testID="collector-references-page"
        />
      </View>
    );
  }
  if (blockedByMe) {
    return (
      <View style={styles.padded}>
        <EmptyState
          testID="collector-references-page-blocked"
          icon="cancel"
          title={PROFILE_COPY.blockedTitle(data.handle)}
          description={PROFILE_COPY.blockedByMe(data.handle)}
          actionLabel={PROFILE_COPY.unblockAction}
          onAction={() =>
            void unblocking
              .unblock({ id: data.id, displayName: data.handle })
              .then((done) => (done ? void profile.refetch() : undefined))
          }
        />
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.list} testID="collector-references-page">
      <CollectorRatingsSection profile={data} isOwn={own} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Fills the page: the EmptyState inside grows (flex: 1) and, in a wrapper without a height,
  // iOS gave it none, cutting off its icon, title and text (review fix 2).
  padded: { flex: 1, padding: spacing[4] },
  list: { padding: spacing[4], gap: spacing[2], flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 44,
  },
  rowText: { flex: 1, minWidth: 0, gap: 4 },
  rowName: { fontSize: 16, lineHeight: 21, fontWeight: fontWeight.semibold },
  rowLine: { fontSize: 13, lineHeight: 18 },
  rowStacked: { flexWrap: 'wrap' },
  mono: { fontFamily: fontFamily.mono },
  price: { alignItems: 'flex-end', gap: 2, maxWidth: '40%' },
  priceStacked: { alignItems: 'flex-start', maxWidth: '100%', width: '100%' },
  pressed: { opacity: 0.8 },
});
