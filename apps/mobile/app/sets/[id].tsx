import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSetDetail } from '@/src/api/hooks/catalog';
import type { PrintingSummary } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { PillButton } from '@/src/components/ui/PillButton';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { setMeta, SET_COPY as COPY } from '@/src/features/catalog/setCopy';
import { gameTile } from '@/src/features/games/gameTiles';
import { SettingsTopBar } from '@/src/features/settings/SettingsPage';
import { editionLabel, printingCode, printingFacts, printingImageUrl } from '@/src/lib/catalog';
import { gameLabel } from '@/src/lib/profile';
import {
  TITLE_MAX_FONT_SCALE,
  fontFamily,
  fontWeight,
  spacing,
  useStackedRows,
  useTheme,
} from '@/src/theme';

const COLUMNS = 3;
/** At the largest text sizes the grid has two columns: a printing's code stays whole. */
const COLUMNS_LARGE = 2;
const GAP = 10;
/** How far a tile's code and rarity follow the text size (a grid has little room). */
const TILE_MAX_FONT_SCALE = 1.6;

/** The width of a grid tile: the columns in the page's 16 pt margins, 10 pt apart. */
function tileWidth(windowWidth: number, columns: number): number {
  return Math.floor((windowWidth - spacing[4] * 2 - GAP * (columns - 1)) / columns);
}

/**
 * A set of the catalog (mockup v50 screen 69, stage R14; `GET /sets/{id}`): the game, the name,
 * "{CODE} · Released {date} · {n} printings", "Who has cards of this set" (Search's card search
 * with the set's cards, every page; it was "Search this set"), then a three-column grid of its
 * printings, paged as the list scrolls; a printing opens Who has this card at that printing. Not
 * found, an error with "Try again", loading and empty states as before.
 */
export default function SetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const columns = useStackedRows() ? COLUMNS_LARGE : COLUMNS;
  const tile = tileWidth(width, columns);
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

  const back = () => (router.canGoBack() ? router.back() : router.replace('/search'));
  const open = (printing: PrintingSummary) => {
    if (printing.cardId) {
      router.push({
        pathname: '/cards/[id]',
        params: { id: printing.cardId, printing: printing.id ?? '' },
      });
    }
  };
  const whoHas = () => {
    if (set?.code) {
      router.navigate({
        pathname: '/search',
        params: { game: set.game ?? '', set: set.code, setName: set.name ?? '', typing: '1' },
      });
    }
  };

  let body;
  if (notFound) {
    body = (
      <View style={styles.state}>
        <EmptyState
          testID="set-not-found"
          icon="collage"
          title={COPY.notFoundTitle}
          description={COPY.notFoundBody}
          actionLabel={COPY.searchCatalog}
          onAction={() => router.navigate('/search')}
        />
      </View>
    );
  } else if (!detail.data && detail.error) {
    body = (
      <View style={styles.state}>
        <ErrorState
          testID="set-error"
          error={detail.error}
          title={COPY.loadError}
          onRetry={() => void detail.refetch()}
        />
      </View>
    );
  } else if (!detail.data) {
    body = <SetSkeleton />;
  } else {
    const colours = set?.game ? gameTile(set.game) : null;
    body = (
      <FlatList
        key={`columns-${columns}`}
        testID="set-printings"
        data={printings}
        numColumns={columns}
        keyExtractor={(printing, index) => printing.id ?? String(index)}
        renderItem={({ item }) => (
          <PrintingTile printing={item} game={set?.game} width={tile} onPress={open} />
        )}
        columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titles}>
              {set?.game ? (
                <Text
                  style={[
                    styles.eyebrow,
                    {
                      color:
                        colours === null
                          ? palette.primary
                          : palette.scheme === 'dark'
                            ? colours.foreground
                            : colours.background,
                    },
                  ]}
                >
                  {gameLabel(set.game).toUpperCase()}
                </Text>
              ) : null}
              <Text
                accessibilityRole="header"
                maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
                testID="set-name"
                style={[styles.name, { color: palette.ink }]}
              >
                {set?.name ?? COPY.set}
              </Text>
              <Text testID="set-meta" style={[styles.meta, { color: palette.textMuted }]}>
                <Text style={styles.mono}>{set?.code ?? ''}</Text>
                {setMeta(set?.releaseDate, total)}
              </Text>
            </View>
            {set?.code ? (
              <PillButton
                label={COPY.whoHas}
                icon="magnify"
                variant="outline"
                onPress={whoHas}
                maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
                testID="set-search"
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            testID="set-empty"
            icon="cards-outline"
            title={COPY.emptyTitle}
            description={COPY.emptyBody}
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
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing[6] }]}
      />
    );
  }

  return (
    <View
      testID="screen-set"
      style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}
    >
      <Stack.Screen options={{ headerShown: false, title: set?.name ?? COPY.set }} />
      <SettingsTopBar title={set?.name ?? COPY.set} onBack={back} backLabel={COPY.back} />
      {body}
    </View>
  );
}

/** One printing of the grid: its picture, its code and its rarity. */
const PrintingTile = memo(function PrintingTile({
  printing,
  game,
  width,
  onPress,
}: {
  printing: PrintingSummary;
  game: string | null | undefined;
  width: number;
  onPress: (printing: PrintingSummary) => void;
}) {
  const { palette } = useTheme();
  const code = printingCode(printing);
  const facts = printingFacts(printing);
  const special =
    printing.edition && printing.edition !== 'UNLIMITED' ? editionLabel(printing.edition) : null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={[code, facts].filter(Boolean).join(', ')}
      accessibilityHint={COPY.tileHint}
      onPress={() => onPress(printing)}
      testID={`set-printing-${printing.id}`}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}
    >
      <CardImage
        src={printingImageUrl(printing)}
        alt=""
        game={game}
        size="sm"
        style={[styles.picture, { width, height: Math.round((width * 86) / 59) }]}
      />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
        style={[styles.code, { color: palette.settings.segmentText }]}
      >
        {code}
      </Text>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
        style={[styles.rarity, { color: palette.textMuted }]}
      >
        {printing.rarity || facts}
      </Text>
      {special ? (
        // Two printings of one code differ by their edition (a 1st Edition and an Unlimited one).
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
          style={[styles.rarity, { color: palette.textMuted }]}
        >
          {special}
        </Text>
      ) : null}
    </Pressable>
  );
});

function SetSkeleton() {
  return (
    <View
      testID="set-loading"
      accessibilityLabel={COPY.loading}
      aria-busy
      style={[styles.list, styles.skeleton]}
    >
      <Skeleton width={70} height={12} />
      <Skeleton width="70%" height={26} />
      <Skeleton width="55%" height={14} />
      <Skeleton width="100%" height={48} radius={24} />
      <View style={styles.gridRow}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={styles.skeletonTile}>
            <Skeleton width="100%" height={130} radius={6} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { flex: 1, paddingHorizontal: spacing[4] },
  list: { paddingHorizontal: spacing[4], paddingTop: 14 },
  header: { gap: 16, marginBottom: 16 },
  titles: { gap: 6 },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: fontWeight.bold, letterSpacing: 0.6 },
  name: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
  },
  meta: { fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: fontFamily.mono },
  gridRow: { gap: GAP, marginBottom: 14 },
  tile: { gap: 5 },
  skeletonTile: { flex: 1 },
  picture: { borderRadius: 6 },
  code: { fontFamily: fontFamily.mono, fontSize: 11, lineHeight: 14 },
  rarity: { fontSize: 11, lineHeight: 14 },
  skeleton: { gap: 10 },
  pressed: { opacity: 0.8 },
});
