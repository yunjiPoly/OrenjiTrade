import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { isApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useRegionBinderCounts } from '@/src/api/hooks/regionMap';
import { useRegions } from '@/src/api/hooks/regions';
import { Button } from '@/src/components/ui/Button';
import { SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { Segmented } from '@/src/components/ui/Segmented';
import { MapLegend } from '@/src/features/map/MapLegend';
import { PlaceList } from '@/src/features/map/PlaceList';
import { placeCodeFrom, regionOf } from '@/src/features/map/places';
import { RegionMap } from '@/src/features/map/RegionMap';
import { binderCountLabel, countsByCode } from '@/src/features/map/shading';
import { RegionBar } from '@/src/features/regions/RegionBar';
import { useBrowsingRegion } from '@/src/features/regions/browsingRegion';
import { useScreenReader } from '@/src/hooks/useScreenReader';
import { isRegionCode, regionName } from '@/src/lib/place';
import { useAppStore, type MapViewChoice } from '@/src/store';
import {
  TITLE_MAX_FONT_SCALE,
  fontWeight,
  radius,
  spacing,
  textStyle,
  useTheme,
} from '@/src/theme';

const VIEWS: readonly { value: MapViewChoice; label: string }[] = [
  { value: 'map', label: 'Map' },
  { value: 'list', label: 'List' },
];

type MapParams = { region?: string; subdivision?: string };

/**
 * Map tab (the web's `/map`, ADR 0017): the browsed platform region as a map of its states and
 * provinces shaded by their number of public binders, and as a list of the same places with their
 * counts. The two are equal ways in: a tap on the map or on a row opens the public binders of
 * that state or province (`/regions/<region>/<code>`). The region switcher sits on top.
 *
 * `/?region=<region>&subdivision=<code>` opens the tab on a region and on one of its states (the
 * web's `/map?region=&subdivision=`).
 *
 * The map is drawn from files of the app: no tile, no map provider, no request for geography, and
 * the device is never asked where it is. No collector has a position: a binder appears under the
 * state or province its owner declared.
 */
export default function MapScreen() {
  const params = useLocalSearchParams<MapParams>();
  const router = useRouter();
  const { palette } = useTheme();
  const account = useAccount();
  const { region, ready, select } = useBrowsingRegion();
  const regions = useRegions();
  const counts = useRegionBinderCounts(region, ready);
  const screenReader = useScreenReader();
  const chosenView = useAppStore((state) => state.prefs.mapView);
  const updatePrefs = useAppStore((state) => state.updatePrefs);
  const view: MapViewChoice = chosenView ?? (screenReader ? 'list' : 'map');
  // The place opened last from the map or the list.
  const [picked, setPicked] = useState<{ region: string; code: string } | null>(null);
  const [touchingMap, setTouchingMap] = useState(false);
  // The height of the page under the header and above the tab bar, once it is laid out.
  const [pageHeight, setPageHeight] = useState(0);

  const platformRegion = regionOf(regions.data, region);
  const name = platformRegion?.name ?? regionName(region);
  const byCode = useMemo(() => countsByCode(counts.data?.subdivisions), [counts.data]);
  const withoutLocation = account.me?.onboarding.locationSet === false;

  const open = useCallback(
    (code: string) => {
      setPicked({ region, code });
      router.push({ pathname: '/regions/[region]/[code]', params: { region, code } });
    },
    [region, router]
  );

  // A link into the tab: its region becomes the browsed one, its state or province opens. Once
  // per link, and only when the account is known (a pick belongs to an account).
  const linkedRegion = isRegionCode(params.region) ? params.region : null;
  const linkedCode = placeCodeFrom(params.subdivision);
  const link = `${linkedRegion ?? ''}|${linkedCode ?? ''}`;
  const followed = useRef('|');
  useEffect(() => {
    if (!ready || link === followed.current) {
      return;
    }
    followed.current = link;
    if (linkedRegion && linkedRegion !== region) {
      select(linkedRegion);
    }
    if (linkedCode) {
      router.push({
        pathname: '/regions/[region]/[code]',
        params: { region: linkedRegion ?? region, code: linkedCode },
      });
    }
  }, [link, linkedCode, linkedRegion, ready, region, router, select]);

  // Outlined on the map and marked in the list while its region is shown: the place opened last,
  // by hand or by the link.
  const opened =
    picked ?? (linkedCode ? { region: linkedRegion ?? region, code: linkedCode } : null);
  const selected = opened && opened.region === region ? opened.code : null;

  let status: string;
  if (counts.data) {
    status = `${binderCountLabel(counts.data.total)} in ${name}`;
  } else if (counts.error) {
    status = 'Binder counts could not load';
  } else {
    status = 'Counting binders…';
  }

  const chrome = (
    <View style={styles.chrome}>
      <RegionBar testID="map-region" />
      <View style={styles.titles}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[textStyle('2xl', 'heading'), styles.title, { color: palette.ink }]}
          testID="map-title"
        >
          Binders in {name}
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          style={[textStyle('md'), { color: palette.textMuted }]}
          testID="map-status"
        >
          {status}
        </Text>
      </View>
      {!counts.data && counts.error ? (
        <View
          accessibilityRole="alert"
          style={[styles.alert, { backgroundColor: palette.surface, borderColor: palette.border }]}
          testID="map-counts-error"
        >
          <MaterialCommunityIcons name="cloud-off-outline" size={22} color={palette.danger} />
          <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
            {isApiError(counts.error)
              ? friendlyMessage(counts.error)
              : 'We could not count the binders right now.'}
          </Text>
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => void counts.refetch()}
            style={styles.small}
            testID="map-counts-retry"
          />
        </View>
      ) : null}
      {withoutLocation ? (
        <SectionCard
          title="Where are you?"
          description="Say which state or province you are in, and collectors of your region can find your public binders here."
          testID="map-location-prompt"
        >
          <Button
            label="Choose my location"
            icon="map-marker-outline"
            onPress={() => router.push('/settings/location')}
            testID="map-choose-location"
          />
        </SectionCard>
      ) : null}
      <Segmented<MapViewChoice>
        label="Map or list"
        options={VIEWS}
        value={view}
        onChange={(mapView) => updatePrefs({ mapView })}
        testID="map-view"
      />
    </View>
  );

  return (
    <Screen testID="screen-map" style={styles.screen}>
      {view === 'list' ? (
        <PlaceList
          region={platformRegion}
          counts={byCode}
          countsKnown={!!counts.data}
          error={regions.error}
          onRetry={() => void regions.refetch()}
          selected={selected}
          onPick={open}
          header={chrome}
        />
      ) : (
        <ScrollView
          // A finger on the map moves the map, not the page.
          scrollEnabled={!touchingMap}
          onLayout={(event) => setPageHeight(event.nativeEvent.layout.height)}
          contentContainerStyle={styles.content}
          testID="map-scroll"
        >
          {chrome}
          <RegionMap
            region={region}
            regionLabel={name}
            counts={byCode}
            selected={selected}
            onPick={open}
            onTouching={setTouchingMap}
            pending={pageHeight === 0}
            style={{ height: mapHeight(pageHeight) }}
          />
          <MapLegend />
          <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="map-hint">
            Tap a state or province to see its public binders. Pinch, drag or use the buttons to
            look closer, or switch to the list.
          </Text>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="map-privacy-note">
            OrenjiTrade never uses your GPS: collectors choose their state or province, and that is
            all anyone sees.
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}

/**
 * The map takes a little more than half of the page (so the region switcher, the title and the
 * legend stay on screen with it on a phone), within what stays comfortable to reach and to read.
 * Measured from the page itself, not from the window: the web build is rendered ahead of time
 * without a window, and a height from the layout is the same on the server and in the browser.
 */
function mapHeight(pageHeight: number): number {
  return Math.round(Math.max(240, Math.min(520, pageHeight * 0.58)));
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  content: { gap: spacing[3], paddingBottom: spacing[6] },
  chrome: { gap: spacing[3] },
  titles: { gap: spacing[1] },
  title: { fontWeight: fontWeight.bold },
  grow: { flex: 1 },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  small: { minHeight: 40, paddingVertical: spacing[2], paddingHorizontal: spacing[3] },
});
