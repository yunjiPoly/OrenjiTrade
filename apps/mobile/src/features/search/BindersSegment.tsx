import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { useRegions } from '@/src/api/hooks/regions';
import { useBinderSearch } from '@/src/api/hooks/search';
import type { PublicBinderSummary } from '@/src/api/types';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { Segmented } from '@/src/components/ui/Segmented';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { CardFan, CoreThumb } from '@/src/features/binders/BinderRows';
import { placeParts, regionOf } from '@/src/features/map/places';
import { useBrowsingRegion } from '@/src/features/regions/browsingRegion';
import { SEARCH_DEBOUNCE_MS, boundedQuery } from '@/src/lib/catalog';
import {
  PINNED_MAX_FONT_SCALE,
  fontWeight,
  radius,
  spacing,
  textStyle,
  useStackedRows,
  useTheme,
} from '@/src/theme';

import { SearchInput } from './SearchField';
import { BINDERS_COPY } from './searchCopy';

type Kind = 'binders' | 'cores';

const KINDS = [
  { value: 'binders', label: BINDERS_COPY.binders },
  { value: 'cores', label: BINDERS_COPY.deckCores },
] as const;

export interface BindersSegmentProps {
  /** The state or province the map's "See binders" chose; null for the whole region. */
  state: string | null;
  onClearState: () => void;
  /** "Pick on the map": back to the map of the Cards segment. */
  onPickOnMap: () => void;
}

/**
 * Search › Binders (owner spec 2026-10-14, section 8, mockup screen 14): the field "Deck, binder or
 * collector, like Yubel" (binder names, handles and a deck core's key cards), the state chip when
 * the map chose one ("Quebec" with ×, back to the whole region) or "Pick on the map", and "Binders
 * | Deck cores". Deck core rows: the 56 pt photo, the name, the handle (and the state or province
 * when the whole region is listed) and the price; binder rows: a fan of 3 cards, the name, the
 * handle and the number of cards. Empty: "No public binders here yet.", "No deck cores for sale
 * here yet.", or "Nothing matches. Try a deck name, a card name or a collector." with a text.
 */
export function BindersSegment({ state, onClearState, onPickOnMap }: BindersSegmentProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const { region } = useBrowsingRegion();
  const regions = useRegions();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('binders');

  useEffect(() => {
    const q = boundedQuery(text);
    if (q === query) {
      return undefined;
    }
    const timer = setTimeout(() => setQuery(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, query]);

  const place = state ? placeParts(regionOf(regions.data, region), state) : null;
  const binders = useBinderSearch({ state, deckCore: kind === 'cores', q: query });
  const rows = useMemo(
    () => binders.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [binders.data]
  );
  const open = (binder: PublicBinderSummary) =>
    router.push({ pathname: '/binders/[id]', params: { id: binder.id, view: 'public' } });

  const head = (
    <View style={styles.head}>
      <SearchInput
        value={text}
        onChangeText={setText}
        label={BINDERS_COPY.fieldLabel}
        placeholder={BINDERS_COPY.placeholder}
        testID="binders-input"
      />
      <View style={styles.filters}>
        {state ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={BINDERS_COPY.stateChip(place?.name ?? state)}
            onPress={onClearState}
            testID="binders-state-chip"
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: palette.surfaceVariant, borderColor: palette.borderStrong },
              pressed && styles.pressed,
            ]}
          >
            <Text
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              style={[textStyle('sm'), styles.bold, { color: palette.ink }]}
            >
              {place?.name ?? state}
            </Text>
            <MaterialCommunityIcons name="close" size={16} color={palette.ink} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={BINDERS_COPY.pickOnMap}
            onPress={onPickOnMap}
            hitSlop={8}
            testID="binders-pick-on-map"
            style={({ pressed }) => [styles.pick, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="map-outline" size={18} color={palette.primary} />
            <Text
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              style={[textStyle('sm'), styles.bold, { color: palette.primary }]}
            >
              {BINDERS_COPY.pickOnMap}
            </Text>
          </Pressable>
        )}
        <Segmented<Kind>
          label={BINDERS_COPY.kindsLabel}
          options={KINDS}
          value={kind}
          onChange={setKind}
          style={styles.kinds}
          testID="binders-kind"
        />
      </View>
    </View>
  );

  let empty;
  if (!binders.data && binders.error) {
    empty = (
      <ErrorState
        testID="binders-error"
        error={binders.error}
        title={BINDERS_COPY.error}
        onRetry={() => void binders.refetch()}
      />
    );
  } else if (!binders.data) {
    empty = <SkeletonList rows={5} rowHeight={72} testID="binders-loading" />;
  } else {
    const message = query
      ? BINDERS_COPY.noMatch
      : kind === 'cores'
        ? BINDERS_COPY.noDeckCores
        : BINDERS_COPY.noBinders;
    empty = (
      <Text
        style={[textStyle('md'), styles.empty, { color: palette.textMuted }]}
        testID="binders-empty"
      >
        {message}
      </Text>
    );
  }

  return (
    <View style={styles.fill} testID="search-binders">
      {head}
      <FlatList
        testID="binders-list"
        style={styles.fill}
        data={binders.data ? rows : []}
        keyExtractor={(binder) => binder.id}
        renderItem={({ item }) => (
          <BinderSearchRow binder={item} wholeRegion={state === null} onPress={open} />
        )}
        ListEmptyComponent={empty}
        ListFooterComponent={
          binders.data ? (
            <ListFooter
              loading={binders.isFetchingNextPage}
              failed={!!binders.error && binders.hasNextPage}
              onRetry={() => void binders.fetchNextPage()}
            />
          ) : null
        }
        onEndReached={() => {
          if (binders.hasNextPage && !binders.isFetchingNextPage && !binders.error) {
            void binders.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={!!binders.data && binders.isRefetching && !binders.isFetchingNextPage}
            onRefresh={() => void binders.refetch()}
          />
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

/** A deck core or a binder of Search › Binders (mockup screen 14). */
export const BinderSearchRow = memo(function BinderSearchRow({
  binder,
  wholeRegion,
  onPress,
}: {
  binder: PublicBinderSummary;
  /** The whole region is listed: the row names the owner's state or province too. */
  wholeRegion: boolean;
  onPress: (binder: PublicBinderSummary) => void;
}) {
  const { palette } = useTheme();
  // Large text: the picture, the name and its line, then the price, one under the other (beside
  // the price the name broke in the middle of a word).
  const stacked = useStackedRows();
  const core = binder.sellsAsCore ?? false;
  const handle = binder.owner?.handle ?? '';
  const province = wholeRegion
    ? (binder.owner?.place?.subdivisionName ?? binder.owner?.place?.label ?? null)
    : null;
  const line = core
    ? BINDERS_COPY.coreLine(handle, province)
    : BINDERS_COPY.binderLine(handle, province, binder.itemCount ?? 0);
  const price = core ? binder.askingPriceText?.trim() || null : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[core ? `Deck core, ${binder.name}` : binder.name, line, price]
        .filter(Boolean)
        .join(', ')}
      onPress={() => onPress(binder)}
      testID={`binder-search-row-${binder.id}`}
      style={({ pressed }) => [
        styles.row,
        stacked && styles.rowStacked,
        { borderBottomColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      {core ? (
        <CoreThumb url={binder.previewImages?.[0]} />
      ) : (
        <CardFan urls={binder.previewImages ?? []} />
      )}
      <View style={[styles.text, stacked && styles.textStacked]}>
        <Text style={[textStyle('md'), styles.bold, { color: palette.ink }]}>{binder.name}</Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{line}</Text>
      </View>
      {price ? (
        <Text
          style={[
            textStyle('md'),
            styles.bold,
            stacked ? styles.priceStacked : styles.price,
            { color: palette.ink },
          ]}
          testID={`binder-search-price-${binder.id}`}
        >
          {price}
        </Text>
      ) : stacked ? null : (
        <MaterialCommunityIcons name="chevron-right" size={20} color={palette.textDisabled} />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { gap: spacing[3], paddingBottom: spacing[2] },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 44,
    paddingHorizontal: spacing[4],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pick: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], minHeight: 44 },
  kinds: { minWidth: 200, flexGrow: 1 },
  bold: { fontWeight: fontWeight.semibold },
  list: { flexGrow: 1, paddingBottom: spacing[6] },
  empty: { paddingVertical: spacing[6], textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 72,
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  price: { maxWidth: '32%', textAlign: 'right' },
  rowStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: spacing[2] },
  textStacked: { flex: 0, alignSelf: 'stretch' },
  priceStacked: { maxWidth: '100%' },
  pressed: { opacity: 0.75 },
});
