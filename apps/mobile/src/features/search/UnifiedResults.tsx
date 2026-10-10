import { useRouter } from 'expo-router';
import { useCallback } from 'react';
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
import { spacing, textStyle, useTheme } from '@/src/theme';

import { BinderResultRow, CollectorResultRow } from './SearchResultRows';
import { SEGMENT_EMPTY, type SearchSegment } from './searchSegments';

export interface UnifiedResultsProps {
  segment: Exclude<SearchSegment, 'cards'>;
  /** The debounced query (empty: the recent searches and an invitation). */
  query: string;
  onSearch: (query: string) => void;
}

/**
 * The Collectors and Binders segments of the Search tab (the web's unified results tabs on
 * `GET /search`): skeleton, the rows, an empty state, an error with retry (offline wording from
 * the API error), the recent searches of the segment while the field is empty. A collector opens
 * their profile, a binder its public view (the existing screens).
 */
export function UnifiedResults({ segment, query, onSearch }: UnifiedResultsProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const uid = useUid();
  const remember = useRecentSearchesStore((state) => state.remember);
  const results = useUnifiedSearch(segment, query);
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

  if (!query) {
    return (
      <View style={styles.idle} testID={`search-${segment}-idle`}>
        <RecentSearches uid={uid} scope={segment} onPick={onSearch} />
        <EmptyState
          testID={`search-${segment}-invite`}
          icon={segment === 'collectors' ? 'account-search-outline' : 'book-search-outline'}
          title={
            segment === 'collectors' ? 'Who trades in your region?' : 'What is in their binders?'
          }
          description={SEGMENT_EMPTY[segment].invite}
        />
      </View>
    );
  }
  if (!results.data && results.error) {
    return (
      <ErrorState
        testID={`search-${segment}-error`}
        error={results.error}
        title="Search could not load"
        onRetry={() => void results.refetch()}
      />
    );
  }
  if (!results.data) {
    return (
      <SkeletonList
        rows={4}
        rowHeight={80}
        testID={`search-${segment}-loading`}
        style={styles.pad}
      />
    );
  }
  const count = items.length;
  const header = (
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
  );
  return (
    <FlatList
      testID={`search-${segment}-results`}
      data={items as (CollectorMarker | PublicBinderSummary)[]}
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
      ListEmptyComponent={
        <EmptyState
          testID={`search-${segment}-empty`}
          icon={segment === 'collectors' ? 'account-search-outline' : 'book-search-outline'}
          title={SEGMENT_EMPTY[segment].title}
          description={SEGMENT_EMPTY[segment].description}
        />
      }
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={
        <RefreshControl
          refreshing={results.isRefetching}
          onRefresh={() => void results.refetch()}
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
  idle: { gap: spacing[3] },
  pad: { paddingTop: spacing[2] },
  header: { gap: spacing[3], marginBottom: spacing[2] },
  listContent: { paddingBottom: spacing[6] },
  separator: { height: spacing[2] },
});
