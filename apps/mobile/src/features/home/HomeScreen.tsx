import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FEED_STALE_MS, useHomeFeed, usePublicCardCount } from '@/src/api/hooks/feed';
import { useMyLocation } from '@/src/api/hooks/location';
import { useRegionOptions, useRegions } from '@/src/api/hooks/regions';
import { useUid } from '@/src/api/hooks/useUid';
import { useWishlist } from '@/src/api/hooks/wishlist';
import type { FeedPost } from '@/src/api/types';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { useIHaveIt } from '@/src/features/collectors/useIHaveIt';
import { useBrowsingGame } from '@/src/features/games/browsingGame';
import { GamePill } from '@/src/features/games/GamePill';
import { useMessageCollector } from '@/src/features/messages/useMessageCollector';
import { NotificationBell } from '@/src/features/notifications/NotificationBell';
import { useBrowsingRegion } from '@/src/features/regions/browsingRegion';
import { RegionAwayNote, RegionBar } from '@/src/features/regions/RegionBar';
import { regionName } from '@/src/lib/place';
import { spacing, useTheme } from '@/src/theme';

import {
  chipEmptyText,
  emptyTitle,
  endText,
  feedRows,
  type FeedFilter,
  type FeedRow,
} from './feedRules';
import { GetStartedCard } from './GetStartedCard';
import {
  getStartedSteps,
  hideGetStarted,
  hydrateGetStarted,
  isComplete,
  useGetStartedStore,
} from './getStarted';
import { useHomeChip } from './homeChip';
import { HOME_COPY } from './homeCopy';
import {
  ChipEmpty,
  FeedChips,
  FeedEnd,
  FeedFooter,
  FeedSectionTitle,
  FeedSkeleton,
  HomeSearchField,
  QuietBox,
} from './HomeParts';
import { FeedPostCard, type PostActions } from './HomePosts';

type Item =
  | { type: 'top'; key: 'top' }
  | { type: 'chips'; key: 'chips' }
  | { type: 'loading'; key: 'loading' }
  | { type: 'error'; key: 'error' }
  | { type: 'quiet'; key: 'quiet' }
  | { type: 'chip-empty'; key: 'chip-empty' }
  | { type: 'end'; key: 'end' }
  | FeedRow;

/**
 * Home (stage R7 of the phone redesign; owner prompt of 2026-10-19,
 * docs/product/specs/2026-10-19-home-full-design.md; mockup v50 screens 10, 10b and 10c), the
 * first of five tabs, for signed-in collectors: the region pill and the game pill with the bell,
 * the search field, Get started, the chips (pinned once scrolled past), then what became public in
 * the browsed region for the browsed game, in sections by time, and the end. Pull to refresh;
 * tapping the Home tab on Home scrolls to the top; coming back refreshes data older than 5
 * minutes; new posts never slide in while someone reads.
 */
export function HomeScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const router = useRouter();
  const uid = useUid();
  const kind = useHomeChip((state) => state.kind);
  const setKind = useCallback((next: FeedFilter) => useHomeChip.setState({ kind: next }), []);
  const browsing = useBrowsingGame();
  const { region } = useBrowsingRegion();
  // The server's list of regions (as Search's map reads it): the pill's and the end's names, and
  // the judge of a region code kept on the device that no longer exists.
  useRegions();
  const regionLabel =
    useRegionOptions().find((option) => option.code === region)?.name ?? regionName(region);
  const gameLabel = browsing.current.name;

  const feed = useHomeFeed(kind);
  // The time the labels are written against: when the posts arrived, or Home came into view.
  const [seenAt, setNow] = useState(() => new Date());
  const now = useMemo(
    () => new Date(Math.max(seenAt.getTime(), feed.dataUpdatedAt)),
    [seenAt, feed.dataUpdatedAt]
  );

  // Get started: the three answers, re-read whenever Home comes back into view.
  const location = useMyLocation();
  const publicCards = usePublicCardCount();
  const wishlist = useWishlist();
  const hidden = useGetStartedStore((state) => (uid ? state.hidden[uid] : undefined));
  useEffect(() => {
    if (uid) {
      void hydrateGetStarted(uid);
    }
  }, [uid]);
  const steps = getStartedSteps({
    location: location.data,
    publicCards: publicCards.data,
    wishes: wishlist.data?.length,
  });
  const complete = steps !== null && isComplete(steps);
  useEffect(() => {
    if (uid && complete && hidden === false) {
      void hideGetStarted(uid);
    }
  }, [complete, hidden, uid]);
  const showGetStarted = hidden === false && steps !== null && !complete;

  const listRef = useRef<FlatList<Item>>(null);
  // A pull to refresh in progress (the spinner shows for a pull only).
  const [pulling, setPulling] = useState(false);
  useScrollToTop(listRef);

  const refetchFeed = feed.refetch;
  const refetchLocation = location.refetch;
  const refetchPublic = publicCards.refetch;
  const refetchWishes = wishlist.refetch;
  // When the feed was last read, for the focus below (a ref: a new page must not re-run it).
  const updatedAt = useRef(0);
  useEffect(() => {
    updatedAt.current = feed.dataUpdatedAt;
  }, [feed.dataUpdatedAt]);
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      void refetchLocation();
      void refetchPublic();
      void refetchWishes();
      if (updatedAt.current > 0 && Date.now() - updatedAt.current > FEED_STALE_MS) {
        void refetchFeed();
      }
    }, [refetchFeed, refetchLocation, refetchPublic, refetchWishes])
  );

  const pages = feed.data?.pages;
  const first = pages?.[0];
  const posts = useMemo(() => (pages ?? []).flatMap((page) => page.items ?? []), [pages]);
  const windowDays = first?.windowDays ?? 30;
  const gameQuiet = first !== undefined && !first.gameHasPosts;
  // A game with nothing in the window has no chips: the chip goes back to All.
  useEffect(() => {
    if (gameQuiet && kind !== 'ALL') {
      setKind('ALL');
    }
  }, [gameQuiet, kind, setKind]);

  // Who to message, and the post whose chat is being opened.
  const { message } = useMessageCollector();
  const { haveIt, busyKey } = useIHaveIt();
  const [messaging, setMessaging] = useState<string | null>(null);
  const actions: PostActions = useMemo(
    () => ({
      onCollector: (post) =>
        router.push({ pathname: '/collectors/[id]', params: { id: post.collector.handle } }),
      onCollectorCards: (post) =>
        router.push({ pathname: '/collectors/[id]/cards', params: { id: post.collector.handle } }),
      onCard: (cardId, printingId) =>
        router.push({ pathname: '/cards/[id]', params: { id: cardId, printing: printingId } }),
      onMessage: (post: FeedPost, itemId: string) => {
        setMessaging(post.id);
        void message(post.collector.id, { itemId }).finally(() => setMessaging(null));
      },
      onHaveIt: (post: FeedPost) => {
        const wish = post.wanted;
        if (!wish) {
          return;
        }
        void haveIt(
          post.collector.id,
          {
            cardId: wish.cardId,
            cardName: wish.name,
            printing: wish.printing ?? null,
            rarity: wish.rarity ?? null,
          },
          post.id
        );
      },
      onDeckCore: (binderId) =>
        router.push({ pathname: '/binders/[id]', params: { id: binderId } }),
      busyPostId: messaging ?? busyKey,
    }),
    [busyKey, haveIt, message, messaging, router]
  );

  const openSearch = () => router.navigate({ pathname: '/search', params: { typing: '1' } });
  const openMap = () => router.navigate({ pathname: '/search', params: { segment: 'cards' } });
  const addCards = () => router.push({ pathname: '/items/new', params: { from: 'home' } });
  const openLocation = () => router.push('/settings/location');

  // What the list holds, top to bottom.
  const items: Item[] = [{ type: 'top', key: 'top' }];
  const loaded = first !== undefined;
  const quiet = loaded && posts.length === 0 && (kind === 'ALL' || gameQuiet);
  // The chips stay above an error too, so a chip that failed can be left for one already read
  // (R7 review U3); only the quiet region has none (10c).
  const showChips = !quiet;
  if (showChips) {
    items.push({ type: 'chips', key: 'chips' });
  }
  if (!loaded) {
    items.push(
      feed.isError ? { type: 'error', key: 'error' } : { type: 'loading', key: 'loading' }
    );
  } else if (quiet) {
    items.push({ type: 'quiet', key: 'quiet' });
  } else if (posts.length === 0) {
    items.push({ type: 'chip-empty', key: 'chip-empty' });
  } else {
    items.push(...feedRows(posts, now));
    if (!feed.hasNextPage) {
      items.push({ type: 'end', key: 'end' });
    }
  }

  const renderItem = ({ item }: { item: Item }) => {
    switch (item.type) {
      case 'top':
        return (
          <View style={[styles.top, { paddingTop: spacing[4] }]}>
            <View style={styles.topRow}>
              <View style={styles.pills}>
                <RegionBar variant="pill" testID="home-region" />
                <GamePill testID="home-game" />
              </View>
              <NotificationBell testID="notification-bell-home" variant="round" />
            </View>
            <HomeSearchField onPress={openSearch} />
            <RegionAwayNote testID="home-region-away" />
            {showGetStarted && steps ? (
              <GetStartedCard
                steps={steps}
                onHide={() => uid && void hideGetStarted(uid)}
                onProvince={openLocation}
                onAddCards={addCards}
                onAddWish={openSearch}
              />
            ) : null}
          </View>
        );
      case 'chips':
        return <FeedChips value={kind} onChange={setKind} />;
      case 'loading':
        return (
          <View style={styles.body}>
            <FeedSkeleton />
          </View>
        );
      case 'error':
        return (
          <ErrorState
            error={feed.error}
            title={HOME_COPY.error}
            keepTitle
            message=""
            retryLabel={HOME_COPY.retry}
            onRetry={() => void feed.refetch()}
            testID="home-error"
          />
        );
      case 'quiet':
        return (
          <View style={[styles.body, styles.quiet]}>
            <QuietBox
              title={emptyTitle(first?.regionHasPosts ?? false, gameLabel, regionLabel)}
              onAddCards={showGetStarted ? undefined : addCards}
            />
          </View>
        );
      case 'chip-empty':
        return kind === 'ALL' ? null : (
          <View style={styles.body}>
            <ChipEmpty
              text={chipEmptyText(kind, regionLabel, windowDays)}
              onShowAll={() => setKind('ALL')}
            />
          </View>
        );
      case 'section':
        return (
          <View style={styles.body}>
            <FeedSectionTitle section={item.section} />
          </View>
        );
      case 'post':
        return (
          <View style={styles.body}>
            <FeedPostCard post={item.post} now={now} actions={actions} />
          </View>
        );
      case 'end':
        return (
          <View style={styles.body}>
            <FeedEnd text={endText(kind, gameLabel, regionLabel, windowDays)} onMap={openMap} />
          </View>
        );
    }
  };

  return (
    <View
      key={`text-size-${fontScale}`}
      testID="screen-home"
      // The list starts under the status bar, so the chips pin right under it, not behind it.
      style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}
    >
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        stickyHeaderIndices={showChips ? [1] : undefined}
        // A refresh while someone reads mid-list (coming back after 5 minutes) puts the new posts
        // above without moving the post on screen (R7 review U6); at the top they show at once.
        maintainVisibleContentPosition={KEEP_READING_PLACE}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            // Only a pull shows the spinner: on iOS a spinner turned on by the app moves the list
            // down by its height, so the refresh on coming back (or after a block) would move the
            // post being read (R7 review U6, seen on the simulator).
            refreshing={pulling}
            onRefresh={() => {
              setNow(new Date());
              setPulling(true);
              void feed.refetch().finally(() => setPulling(false));
              void location.refetch();
              void publicCards.refetch();
              void wishlist.refetch();
            }}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage && !feed.isFetchNextPageError) {
            void feed.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        initialNumToRender={12}
        ListFooterComponent={
          loaded && posts.length > 0 ? (
            <View style={styles.body}>
              <FeedFooter
                loading={feed.isFetchingNextPage}
                failed={feed.isFetchNextPageError}
                onRetry={() => void feed.fetchNextPage()}
              />
            </View>
          ) : null
        }
        testID="home-list"
      />
    </View>
  );
}

/** The first row on screen stays where it is when rows are added above it (the top row counts). */
const KEEP_READING_PLACE = { minIndexForVisible: 0 } as const;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: spacing[6] },
  top: { paddingHorizontal: spacing[4], gap: 14, paddingBottom: spacing[1] },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  pills: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing[2],
  },
  body: { paddingHorizontal: spacing[4], paddingBottom: 10 },
  quiet: { paddingTop: spacing[2] },
});
