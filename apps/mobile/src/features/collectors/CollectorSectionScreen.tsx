import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { useAccount } from '@/src/account/AccountProvider';
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

import { CollectorRatingsSection } from './CollectorRatingsSection';
import { PROFILE_COPY } from './profileCopy';
import { WishRow, wishRowFromSummary } from './ProfileSections';
import { useIHaveIt } from './useIHaveIt';

export type CollectorSection = 'cards' | 'binders' | 'wishes' | 'references';

/**
 * The "See all" pages of another collector's profile (owner spec 2026-10-14, section 9): every
 * public card (pages of 24, a card opens Who has this card on that printing), every public binder
 * and deck core (a row opens it), every public wish (with "I have it"), and every rating and
 * reference (the full section: the breakdown, "Rate this collector" after a deal or a real
 * conversation, "Write a reference"). The same visibility as the profile: a hidden or blocked
 * collector's lists answer 404, shown as "not available".
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
}: {
  error: ApiError | null;
  onRetry: () => void;
  testID: string;
}): ReactNode {
  const router = useRouter();
  if (error?.status === 404) {
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
      accessibilityHint="Opens Who has this card"
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
  if (!pages.data) {
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
  if (!binders.data) {
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
      data={binders.data}
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
  if (!wishes.data || !data) {
    return (
      <View style={styles.padded}>
        <States
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
  const own = useAccount().me?.id === profile.data?.id;
  if (!profile.data) {
    return (
      <View style={styles.padded}>
        <States
          error={profile.error}
          onRetry={() => void profile.refetch()}
          testID="collector-references-page"
        />
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.list} testID="collector-references-page">
      <CollectorRatingsSection profile={profile.data} isOwn={own} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  padded: { padding: spacing[4] },
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
