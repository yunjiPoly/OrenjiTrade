import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useMyLocation } from '@/src/api/hooks/location';
import { useRegionBinderCounts } from '@/src/api/hooks/regionMap';
import { useRegions } from '@/src/api/hooks/regions';
import type { SubdivisionBinderCount } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { Text } from '@/src/components/ui/Text';
import { MapLegend } from '@/src/features/map/MapLegend';
import { MIN_MAP_HEIGHT } from '@/src/features/map/mapWindow';
import { PlaceList } from '@/src/features/map/PlaceList';
import { placeParts, regionOf, placeLabelOf } from '@/src/features/map/places';
import { RegionMap } from '@/src/features/map/RegionMap';
import { SHADE_OPACITY, countsByCode, shadeLevel } from '@/src/features/map/shading';
import { useBrowsingGame } from '@/src/features/games/browsingGame';
import { RegionAwayNote, RegionBar } from '@/src/features/regions/RegionBar';
import { useBrowsingRegion } from '@/src/features/regions/browsingRegion';
import { useScreenReader } from '@/src/hooks/useScreenReader';
import { regionName } from '@/src/lib/place';
import {
  PINNED_MAX_FONT_SCALE,
  elevation,
  fontWeight,
  radius,
  spacing,
  textStyle,
  useTheme,
} from '@/src/theme';

import { SearchFieldButton } from './SearchField';
import { MAP_COPY } from './searchCopy';

export interface SearchMapProps {
  /** The field: opens the card search (screen 12). */
  onType: () => void;
  /** "See binders": the Binders segment filtered to that state or province. */
  onSeeBinders: (code: string) => void;
  /**
   * The state or province a link asked for (`/search?region=&subdivision=`), on its region (the
   * browsed one when the link names none), picked on the map once per link (`nonce`).
   */
  linkedPlace: { region: string | null; code: string; nonce: number } | null;
}

/** The map is never shorter than this inside Search, so the state card and the legend fit. */
const SEARCH_MAP_MIN_HEIGHT = Math.max(MIN_MAP_HEIGHT, 380);

/**
 * Above this system text size the state card leaves the map and stands under it (over the map it
 * covered the whole drawing at the accessibility sizes); the legend follows the size a little only.
 * The map then keeps its smallest height, so the card's top shows under it without scrolling and a
 * finger on the card scrolls the page: a zoomed-in map keeps a finger for itself, and a map as
 * tall as the page left only the field to scroll the page with.
 */
const OVERLAY_MAX_FONT_SCALE = PINNED_MAX_FONT_SCALE;

/**
 * Search's default view (owner spec 2026-10-14, section 8, mockup screen 11): the field "Card name
 * or code, like LOB-EN001" and the M9 region map, shaded by public binders, with the region pill
 * top left, "My province" (the declared state or province, never a device location) and zoom on
 * the right, the legend "Public binders" at the bottom. The map opens centred on the collector's
 * province with its card; tapping a state opens the card of that state: its name and country,
 * "{n} binders · {n} deck cores" (only the parts above 0, "No public binders here yet" without
 * any), "See binders" and a close button. No Filters button. A screen reader gets every state and
 * province as a list instead of the drawn map; a row opens its binders.
 */
export function SearchMap({ onType, onSeeBinders, linkedPlace }: SearchMapProps) {
  const { palette } = useTheme();
  const { region, ready } = useBrowsingRegion();
  const browsing = useBrowsingGame();
  const gameName = browsing.current.name;
  const regions = useRegions();
  const counts = useRegionBinderCounts(region, ready && browsing.ready, browsing.game);
  const location = useMyLocation();
  const screenReader = useScreenReader();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > OVERLAY_MAX_FONT_SCALE;
  const platformRegion = regionOf(regions.data, region);
  const name = platformRegion?.name ?? regionName(region);
  const mapLabel = MAP_COPY.mapLabel(gameName, name);
  const byCode = useMemo(() => countsByCode(counts.data?.subdivisions), [counts.data]);
  const entries = useMemo(() => {
    const map = new Map<string, SubdivisionBinderCount>();
    for (const entry of counts.data?.subdivisions ?? []) {
      map.set(entry.code, entry);
    }
    return map;
  }, [counts.data]);
  const homeCode = location.data?.location?.subdivisionCode ?? null;
  const homeInRegion = location.data?.location?.regionCode === region ? homeCode : null;
  // The state shown on the card, per region: the collector's province until another is tapped
  // (the mockup opens on it), none once the card is closed; a link's state wins once.
  const [picked, setPicked] = useState<{ region: string; code: string | null } | null>(null);
  const [linkUsed, setLinkUsed] = useState<number | null>(null);
  if (linkedPlace && linkedPlace.nonce !== linkUsed) {
    setLinkUsed(linkedPlace.nonce);
    setPicked({ region: linkedPlace.region ?? region, code: linkedPlace.code });
  }
  const selected = picked && picked.region === region ? picked.code : homeInRegion;
  const [pageHeight, setPageHeight] = useState(0);
  const [fieldHeight, setFieldHeight] = useState(0);
  const [mapKeepsTouch, setMapKeepsTouch] = useState(false);
  const pick = useCallback((code: string | null) => setPicked({ region, code }), [region]);
  const nameOf = useCallback(
    (code: string) => placeLabelOf(platformRegion, code),
    [platformRegion]
  );

  const field = (
    <View
      onLayout={(event) => setFieldHeight(event.nativeEvent.layout.height)}
      style={styles.field}
      testID="search-field-frame"
    >
      <SearchFieldButton onPress={onType} />
      <RegionAwayNote testID="search-region-away" />
    </View>
  );

  if (screenReader) {
    return (
      <View style={styles.fill} testID="search-map">
        <PlaceList
          region={platformRegion}
          loaded={regions.data !== undefined}
          counts={byCode}
          countsKnown={!!counts.data}
          error={regions.error}
          onRetry={() => void regions.refetch()}
          selected={selected}
          onPick={onSeeBinders}
          header={
            <View style={styles.listHead}>
              {field}
              <RegionBar testID="search-region" />
              <Text
                accessibilityRole="header"
                style={[textStyle('lg', 'heading'), styles.bold, { color: palette.ink }]}
              >
                {MAP_COPY.listTitle}
              </Text>
            </View>
          }
          testID="search-places"
        />
      </View>
    );
  }

  const place = selected ? placeParts(platformRegion, selected) : null;
  const entry = selected ? entries.get(selected) : undefined;
  const card =
    selected && place ? (
      <StateCard
        code={selected}
        name={place.name}
        subtitle={MAP_COPY.stateSubtitle(place.country, selected === homeCode)}
        binders={entry?.binderCount ?? 0}
        deckCores={entry?.deckCoreCount ?? 0}
        game={gameName}
        known={!!counts.data}
        onSeeBinders={() => onSeeBinders(selected)}
        onClose={() => pick(null)}
      />
    ) : null;

  const countsFailed = !counts.data && !!counts.error;
  const height = stacked
    ? SEARCH_MAP_MIN_HEIGHT
    : Math.max(SEARCH_MAP_MIN_HEIGHT, pageHeight - fieldHeight - spacing[3]);
  return (
    <ScrollView
      style={styles.fill}
      scrollEnabled={!mapKeepsTouch}
      onLayout={(event) => setPageHeight(Math.round(event.nativeEvent.layout.height))}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="search-map"
    >
      {field}
      {countsFailed ? (
        <View
          accessibilityRole="alert"
          style={[styles.alert, { backgroundColor: palette.surface, borderColor: palette.border }]}
          testID="search-map-counts-error"
        >
          <MaterialCommunityIcons name="cloud-off-outline" size={22} color={palette.danger} />
          <Text style={[textStyle('sm'), styles.fill, { color: palette.ink }]}>
            {isApiError(counts.error) ? friendlyMessage(counts.error) : MAP_COPY.countsError}
          </Text>
          <Button
            label={MAP_COPY.tryAgain}
            variant="secondary"
            onPress={() => void counts.refetch()}
            style={styles.small}
            testID="search-map-counts-retry"
          />
        </View>
      ) : null}
      <RegionMap
        region={region}
        regionLabel={name}
        accessibilityLabel={mapLabel}
        counts={byCode}
        selected={selected}
        onPick={pick}
        nameOf={nameOf}
        home={homeInRegion}
        onTouching={setMapKeepsTouch}
        pending={pageHeight === 0 || fieldHeight === 0}
        topLeft={<RegionBar variant="pill" testID="search-region" />}
        bottom={
          <View style={styles.overlay} pointerEvents="box-none">
            {stacked ? null : card}
            <View
              style={[
                styles.legend,
                { backgroundColor: palette.background, borderColor: palette.border },
              ]}
            >
              <MapLegend
                testID="search-map-legend"
                maxFontSizeMultiplier={OVERLAY_MAX_FONT_SCALE}
              />
            </View>
          </View>
        }
        style={{ height }}
        testID="search-region-map"
      />
      {stacked ? card : null}
      <Text style={[textStyle('xs'), { color: palette.textMuted }]} testID="search-map-privacy">
        {MAP_COPY.privacy}
      </Text>
    </ScrollView>
  );
}

/** The card of a tapped state or province (mockup screen 11). */
function StateCard({
  code,
  name,
  subtitle,
  binders,
  deckCores,
  game,
  known,
  onSeeBinders,
  onClose,
}: {
  code: string;
  name: string;
  subtitle: string;
  binders: number;
  deckCores: number;
  /** The browsed game's name ("No public Pokémon binders here yet"). */
  game: string;
  /** The counts answered (until then the card says nothing of the binders). */
  known: boolean;
  onSeeBinders: () => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const level = shadeLevel(binders);
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${name}, ${subtitle}`}
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.borderStrong },
        elevation.floating,
      ]}
      testID="search-state-card"
    >
      <View style={styles.cardHead}>
        <View style={styles.fill}>
          <Text
            accessibilityRole="header"
            style={[textStyle('lg', 'heading'), styles.bold, { color: palette.ink }]}
            testID="search-state-name"
          >
            {name}
          </Text>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="search-state-sub">
            {subtitle}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={MAP_COPY.close}
          onPress={onClose}
          hitSlop={6}
          testID="search-state-close"
          style={({ pressed }) => [
            styles.close,
            { backgroundColor: palette.surfaceVariant },
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons name="close" size={18} color={palette.ink} />
        </Pressable>
      </View>
      {known ? (
        <View style={styles.cardFoot}>
          <View style={styles.stats}>
            <View
              style={[
                styles.swatch,
                { backgroundColor: palette.surface, borderColor: palette.borderStrong },
              ]}
            >
              <View
                style={[
                  styles.fill,
                  { backgroundColor: palette.primary, opacity: SHADE_OPACITY[level] },
                ]}
              />
            </View>
            <Text
              accessibilityLiveRegion="polite"
              style={[textStyle('md'), styles.fill, { color: palette.ink }]}
              testID={`search-state-stats-${code}`}
            >
              {MAP_COPY.stats(binders, deckCores, game)}
            </Text>
          </View>
          {binders > 0 ? (
            <Button
              label={MAP_COPY.seeBinders}
              onPress={onSeeBinders}
              style={styles.seeBinders}
              testID="search-state-see-binders"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: spacing[3], paddingBottom: spacing[4] },
  field: { gap: spacing[2] },
  listHead: { gap: spacing[3], marginBottom: spacing[2] },
  bold: { fontWeight: fontWeight.bold },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  small: { minHeight: 40, paddingVertical: spacing[2], paddingHorizontal: spacing[3] },
  overlay: { gap: spacing[2] },
  legend: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
    opacity: 0.94,
  },
  card: { padding: spacing[4], gap: spacing[3], borderRadius: radius.lg, borderWidth: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFoot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexGrow: 1,
    flexShrink: 1,
  },
  swatch: { width: 14, height: 14, borderRadius: 3, borderWidth: 1, overflow: 'hidden' },
  seeBinders: { minHeight: 44, paddingHorizontal: spacing[5] },
  pressed: { opacity: 0.75 },
});
