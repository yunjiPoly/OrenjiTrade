import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useSetDetail } from '@/src/api/hooks/catalog';
import type { PrintingSummary } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { printingCode, printingFacts, printingImageUrl } from '@/src/lib/catalog';
import { gameLabel } from '@/src/lib/profile';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * A set of the catalog (the web's `/sets/:id`, `GET /sets/{id}`): name, code, game, release,
 * and its printings paged; a printing opens its card with that printing selected. "Search this
 * set" opens the Search tab filtered by the set.
 */
export default function SetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const detail = useSetDetail(id);
  const set = detail.data?.pages[0]?.set;
  const printings = useMemo(
    () => detail.data?.pages.flatMap((page) => page.printings?.items ?? []) ?? [],
    [detail.data]
  );
  const total = detail.data?.pages[0]?.printings?.totalItems ?? printings.length;
  const notFound =
    !!detail.error &&
    (detail.error.status === 404 || detail.error.errorCode === 'VALIDATION_FAILED');

  const open = (printing: PrintingSummary) => {
    if (printing.cardId) {
      router.push({
        pathname: '/cards/[id]',
        params: { id: printing.cardId, printing: printing.id ?? '' },
      });
    }
  };

  let body;
  if (notFound) {
    body = (
      <EmptyState
        testID="set-not-found"
        icon="collage"
        title="Set not found"
        description="This set does not exist or is no longer in the catalog."
        actionLabel="Search the catalog"
        onAction={() => router.navigate('/search')}
      />
    );
  } else if (!detail.data && detail.error) {
    body = (
      <ErrorState
        testID="set-error"
        error={detail.error}
        title="This set could not load"
        onRetry={() => void detail.refetch()}
      />
    );
  } else if (!detail.data) {
    body = <SkeletonList rows={5} rowHeight={72} testID="set-loading" />;
  } else {
    body = (
      <FlatList
        testID="set-printings"
        data={printings}
        keyExtractor={(printing, index) => printing.id ?? String(index)}
        renderItem={({ item }) => {
          const code = printingCode(item);
          return (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${code}${printingFacts(item) ? `, ${printingFacts(item)}` : ''}`}
              accessibilityHint="Opens the card"
              onPress={() => open(item)}
              testID={`set-printing-${item.id}`}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: palette.surface, borderColor: palette.border },
                pressed && styles.pressed,
              ]}
            >
              <CardImage src={printingImageUrl(item)} alt="" game={set?.game} size="sm" />
              <View style={styles.text}>
                <Text
                  style={[textStyle('md'), styles.strong, styles.mono, { color: palette.ink }]}
                  numberOfLines={1}
                >
                  {code}
                </Text>
                <Text style={[textStyle('xs'), { color: palette.textMuted }]} numberOfLines={2}>
                  {printingFacts(item) || set?.name || ''}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <View style={styles.header}>
            {set?.game ? (
              <Text style={[textStyle('xs'), styles.eyebrow, { color: palette.primary }]}>
                {gameLabel(set.game)}
              </Text>
            ) : null}
            <Text
              accessibilityRole="header"
              testID="set-name"
              style={[textStyle('2xl', 'heading'), styles.title, { color: palette.ink }]}
            >
              {set?.name ?? 'Set'}
            </Text>
            <Text testID="set-meta" style={[textStyle('sm'), { color: palette.textMuted }]}>
              <Text style={styles.mono}>{set?.code ?? ''}</Text>
              {set?.releaseDate ? ` · Released ${set.releaseDate.slice(0, 10)}` : ''}
              {` · ${total} ${total === 1 ? 'printing' : 'printings'}`}
            </Text>
            {set?.code ? (
              <Button
                label="Search this set"
                icon="magnify"
                variant="secondary"
                onPress={() =>
                  router.navigate({
                    pathname: '/search',
                    params: { game: set.game ?? '', set: set.code ?? '', q: '', tab: 'cards' },
                  })
                }
                style={styles.search}
                testID="set-search"
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            testID="set-empty"
            icon="cards-outline"
            title="No printings yet"
            description="This set has no printings in the catalog yet."
          />
        }
        ListFooterComponent={
          <ListFooter
            loading={detail.isFetchingNextPage}
            failed={!!detail.error && detail.hasNextPage}
            onRetry={() => void detail.fetchNextPage()}
          />
        }
        onEndReached={() => {
          if (detail.hasNextPage && !detail.isFetchingNextPage && !detail.error) {
            void detail.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={detail.isRefetching && !detail.isFetchingNextPage}
            onRefresh={() => void detail.refetch()}
          />
        }
        contentContainerStyle={styles.listContent}
      />
    );
  }

  return (
    <Screen testID="screen-set" style={styles.screen}>
      <Stack.Screen options={{ title: set?.name ?? 'Set' }} />
      {body}
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  header: { gap: spacing[1], marginBottom: spacing[3] },
  eyebrow: { fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontWeight: fontWeight.bold },
  mono: { fontFamily: fontFamily.mono },
  search: { alignSelf: 'flex-start', marginTop: spacing[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  text: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  listContent: { paddingBottom: spacing[6] },
  separator: { height: spacing[2] },
  pressed: { opacity: 0.8 },
});
