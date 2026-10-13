import { useRouter } from 'expo-router';
import { useCallback, type ReactElement } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useUnifiedSearch } from '@/src/api/hooks/search';
import { useUid } from '@/src/api/hooks/useUid';
import type { CollectorMarker, PublicBinderSummary } from '@/src/api/types';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { SponsoredSlot } from '@/src/features/ads/SponsoredSlot';
import { RecentSearches } from '@/src/features/catalog/RecentSearches';
import { useRecentSearchesStore } from '@/src/features/catalog/recentSearchesStore';
import { useBrowsingRegion } from '@/src/features/regions/browsingRegion';
import { regionPhrase } from '@/src/lib/place';
import { spacing, textStyle, useTheme } from '@/src/theme';

import { BinderResultRow, CollectorResultRow } from './SearchResultRows';
import { SEGMENT_EMPTY, segmentInvite, type SearchSegment } from './searchSegments';

export interface UnifiedResultsProps {
  segment: Exclude<SearchSegment, 'cards'>;
  /** The debounced query (empty: the recent searches and an invitation). */
  query: string;
  onSearch: (query: string) => void;
  /** The search field: the head of the list, which scrolls away with the results. */
  controls: ReactElement;
}

/**
 * The Collectors and Binders segments of the Search tab (the web's unified results tabs on
 * `GET /search`): skeleton, the rows, an empty state, an error with retry (offline wording from
 * the API error), the recent searches of the segment while the field is empty. A collector opens
 * their profile, a binder its public view (the existing screens).
 *
 * One list whatever it shows, with the search field as its head: the field and every result can
 * be scrolled to at any text size, and the field stays mounted (it keeps its focus) while the
 * list goes from the invitation to the skeleton to the rows.
 */
export function UnifiedResults({ segment, query, onSearch, controls }: UnifiedResultsProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const uid = useUid();
  const remember = useRecentSearchesStore((state) => state.remember);
  const results = useUnifiedSearch(segment, query);
  const { region, home } = useBrowsingRegion();
  const invite = segmentInvite(segment, regionPhrase(region, home));
  const items =
    segment === 'collectors' ? (results.data?.collectors ?? []) : (results.data?.binders ?? []);

  const openCollector = useCallback(
    (collector: CollectorMarker) => {
      if (uid && query) {
        remember(uid, query, 'collectors');
      }
      router.push({ pathname: '/collectors/[id]', params: { id: collector.handle } });
    },
    [query, remember, router, uid]
  );
  const openBinder = useCallback(
    (binder: PublicBinderSummary) => {
      if (uid && query) {
        remember(uid, query, 'binders');
      }
      router.push({ pathname: '/binders/[id]', params: { id: binder.id, view: 'public' } });
    },
    [query, remember, router, uid]
  );

  const count = items.length;
  const listed = !!query && !!results.data;

  let empty: ReactElement;
  if (!query) {
    empty = (
      <View style={styles.idle} testID={`search-${segment}-idle`}>
        <RecentSearches uid={uid} scope={segment} onPick={onSearch} />
        <EmptyState
          testID={`search-${segment}-invite`}
          icon={segment === 'collectors' ? 'account-search-outline' : 'book-search-outline'}
          title={invite.title}
          description={invite.description}
        />
      </View>
    );
  } else if (!results.data && results.error) {
    empty = (
      <ErrorState
        testID={`search-${segment}-error`}
        error={results.error}
        title="Search could not load"
        onRetry={() => void results.refetch()}
      />
    );
  } else if (!results.data) {
    empty = (
      <SkeletonList
        rows={4}
        rowHeight={80}
        testID={`search-${segment}-loading`}
        style={styles.pad}
      />
    );
  } else {
    empty = (
      <EmptyState
        testID={`search-${segment}-empty`}
        icon={segment === 'collectors' ? 'account-search-outline' : 'book-search-outline'}
        title={SEGMENT_EMPTY[segment].title}
        description={SEGMENT_EMPTY[segment].description}
      />
    );
  }

  const header = (
    <>
      {controls}
      {listed ? (
        <View style={styles.header}>
          <Text
            testID={`search-${segment}-count`}
            accessibilityLiveRegion="polite"
            style={[textStyle('sm'), { color: palette.textMuted }]}
          >
            {count}{' '}
            {segment === 'collectors'
              ? count === 1
                ? 'collector'
                : 'collectors'
              : count === 1
                ? 'public binder'
                : 'public binders'}{' '}
            for “{query}”{results.isFetching ? ' · updating…' : ''}
          </Text>
          <SponsoredSlot placement="SEARCH_SPONSORED" game={null} variant="compact" />
        </View>
      ) : null}
    </>
  );
  return (
    <FlatList
      testID={`search-${segment}-results`}
      style={styles.fill}
      data={listed ? (items as (CollectorMarker | PublicBinderSummary)[]) : []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) =>
        segment === 'collectors' ? (
          <CollectorResultRow collector={item as CollectorMarker} onPress={openCollector} />
        ) : (
          <BinderResultRow binder={item as PublicBinderSummary} onPress={openBinder} />
        )
      }
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      // Always there, also while the list has nothing to refresh: a refresh control that comes
      // with the first results makes React Native build the list's content again (it changes
      // place among the scroll view's children on iOS, the scroll view is wrapped on Android),
      // and the field in its head lost the keyboard after the first letter.
      refreshControl={
        <RefreshControl
          refreshing={listed && results.isRefetching}
          onRefresh={() => {
            if (query) {
              void results.refetch();
            }
          }}
        />
      }
      contentContainerStyle={styles.listContent}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Fills the tab under the field: the invitation is centred in what is left. (Without a height
  // of its own this view collapsed on iOS and only the invitation's icon showed, over the field.)
  // It is what the list holds while it has no row, and the list's content is at least as tall
  // as the tab (`listContent`), so "what is left" is the room under the field.
  idle: { flex: 1, gap: spacing[3] },
  pad: { paddingTop: spacing[2] },
  header: { gap: spacing[3], marginBottom: spacing[2] },
  listContent: { flexGrow: 1, paddingBottom: spacing[6] },
  separator: { height: spacing[2] },
});
