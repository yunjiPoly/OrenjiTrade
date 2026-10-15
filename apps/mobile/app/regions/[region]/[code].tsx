import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { useRegionBinderCounts, useSubdivisionBinders } from '@/src/api/hooks/regionMap';
import { useRegions } from '@/src/api/hooks/regions';
import type { PublicBinderSummary } from '@/src/api/types';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { PlaceBinderRow } from '@/src/features/map/PlaceBinderRow';
import { placeCodeFrom, placeLabelOf, regionOf } from '@/src/features/map/places';
import { binderCountLabel } from '@/src/features/map/shading';
import { isRegionCode, regionName } from '@/src/lib/place';
import { TITLE_MAX_FONT_SCALE, fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * The public binders of one state or province (`/regions/<region>/<code>`; the web's state panel
 * of `/map?region=&subdivision=`, `GET /regions/{region}/subdivisions/{code}/binders`): opened
 * from the map, from the list of states and provinces or by a link. Each binder names its owner
 * and the owner's state or province and country, never a city (ADR 0017); the list is read page
 * after page by cursor.
 */
export default function PlaceBindersScreen() {
  const params = useLocalSearchParams<{ region?: string; code?: string }>();
  const region = isRegionCode(params.region) ? params.region : null;
  const code = placeCodeFrom(params.code);
  const router = useRouter();
  const { palette } = useTheme();
  const regions = useRegions();
  const counts = useRegionBinderCounts(region ?? '', region !== null);
  const binders = useSubdivisionBinders(region, code);

  const place = region && code ? placeLabelOf(regionOf(regions.data, region), code) : null;
  const title = place ?? code ?? 'Binders';
  const count = counts.data
    ? (counts.data.subdivisions.find((entry) => entry.code === code)?.binderCount ?? 0)
    : null;
  const rows = useMemo(
    () => binders.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [binders.data]
  );
  const open = useCallback(
    (binder: PublicBinderSummary) =>
      router.push({ pathname: '/binders/[id]', params: { id: binder.id, view: 'public' } }),
    [router]
  );

  if (!region || !code) {
    return (
      <Screen safeBottom testID="screen-place">
        <Stack.Screen options={{ title: 'Binders' }} />
        <EmptyState
          testID="place-unknown"
          icon="map-marker-question-outline"
          title="This place is not on the map"
          description="Choose a state or province on the map or in its list."
          actionLabel="Open the map"
          onAction={() => router.navigate('/')}
        />
      </Screen>
    );
  }

  const header = (
    <View style={styles.header}>
      <Text style={[textStyle('sm'), styles.eyebrow, { color: palette.primary }]}>
        {regionName(region)}
      </Text>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
        style={[textStyle('2xl', 'heading'), styles.title, { color: palette.ink }]}
        testID="place-title"
      >
        {title}
      </Text>
      {count !== null ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[textStyle('md'), { color: palette.textMuted }]}
          testID="place-count"
        >
          {binderCountLabel(count)}
        </Text>
      ) : null}
    </View>
  );

  // The place, its region and its count are the head of the list and scroll away with it: at
  // large text sizes they would otherwise keep half of the screen and leave the binders a strip.
  let body;
  if (!binders.data && binders.error) {
    body = (
      <>
        {header}
        <ErrorState
          testID="place-error"
          error={binders.error}
          title="We could not load these binders"
          onRetry={() => void binders.refetch()}
        />
      </>
    );
  } else if (!binders.data) {
    body = (
      <>
        {header}
        <SkeletonList rows={4} rowHeight={112} testID="place-loading" />
      </>
    );
  } else {
    body = (
      <FlatList
        testID="place-binders"
        accessibilityLabel="Public binders"
        data={rows}
        keyExtractor={(binder) => binder.id}
        renderItem={({ item }) => <PlaceBinderRow binder={item} onPress={open} />}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            testID="place-empty"
            icon="book-open-page-variant-outline"
            title="No public binders here yet"
            description="Binders appear here while their owner is discoverable and keeps them public and fresh."
          />
        }
        ListFooterComponent={
          <ListFooter
            loading={binders.isFetchingNextPage}
            failed={!!binders.error && binders.hasNextPage}
            onRetry={() => void binders.fetchNextPage()}
            testID="place-more"
          />
        }
        onEndReached={() => {
          if (binders.hasNextPage && !binders.isFetchingNextPage && !binders.error) {
            void binders.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={binders.isRefetching && !binders.isFetchingNextPage}
            onRefresh={() => void binders.refetch()}
          />
        }
        contentContainerStyle={styles.listContent}
      />
    );
  }

  return (
    <Screen safeBottom testID="screen-place" style={styles.screen}>
      <Stack.Screen options={{ title }} />
      <View style={styles.fill}>{body}</View>
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  fill: { flex: 1 },
  header: { gap: spacing[1], marginBottom: spacing[4] },
  eyebrow: { fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontWeight: fontWeight.bold },
  listContent: { paddingBottom: spacing[6] },
  separator: { height: spacing[2] },
});
