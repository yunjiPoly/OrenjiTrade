import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { isApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useRegionBinderCounts } from '@/src/api/hooks/regionMap';
import { useRegions } from '@/src/api/hooks/regions';
import { Button } from '@/src/components/ui/Button';
import { Screen } from '@/src/components/ui/Screen';
import { Segmented } from '@/src/components/ui/Segmented';
import { MapLegend } from '@/src/features/map/MapLegend';
import { mapFrameHeight } from '@/src/features/map/mapWindow';
import { PlaceList } from '@/src/features/map/PlaceList';
import { placeCodeFrom, placeLabelOf, regionOf } from '@/src/features/map/places';
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
 * web's `/map?region=&subdivision=`). A link is used up once followed, so the same link opens the
 * same place every time it is tapped; a link to a region that does not exist changes nothing.
 *
 * The map is drawn from files of the app: no tile, no map provider, no request for geography, and
 * the device is never asked where it is. No collector has a position: a binder appears under the
 * state or province its owner declared.
 */
export default function MapScreen() {
  const params = useLocalSearchParams<MapParams>();
  const router = useRouter();
  const navigation = useNavigation<{ setParams: (params: Partial<MapParams>) => void }>();
  const { palette } = useTheme();
  const account = useAccount();
  const { region, ready, select, knows } = useBrowsingRegion();
  const regions = useRegions();
  const counts = useRegionBinderCounts(region, ready);
  const screenReader = useScreenReader();
  const chosenView = useAppStore((state) => state.prefs.mapView);
  const updatePrefs = useAppStore((state) => state.updatePrefs);
  const view: MapViewChoice = chosenView ?? (screenReader ? 'list' : 'map');
  // The place opened last from the map or the list.
  const [picked, setPicked] = useState<{ region: string; code: string } | null>(null);
  // The place a link asked for, until it is opened (see the link effects below).
  const [linkedOpening, setLinkedOpening] = useState<{ region: string; code: string } | null>(null);
  // True while the map keeps a gesture for itself (a zoomed-in map under a finger, a pinch).
  const [mapKeepsTouch, setMapKeepsTouch] = useState(false);
  // The height of the page under the header and above the tab bar, and of what stands above the
  // map in it, once they are laid out.
  const [pageHeight, setPageHeight] = useState(0);
  const [chromeHeight, setChromeHeight] = useState(0);
  // The "Where are you?" prompt can be put away for the visit, like on the web.
  const [promptDismissed, setPromptDismissed] = useState(false);
  // Pressing the Map tab again brings the page back to its top.
  const page = useRef<ScrollView>(null);
  useScrollToTop(page);

  const platformRegion = regionOf(regions.data, region);
  const name = platformRegion?.name ?? regionName(region);
  const byCode = useMemo(() => countsByCode(counts.data?.subdivisions), [counts.data]);
  const withoutLocation = account.me?.onboarding.locationSet === false;
  const nameOf = useCallback(
    (code: string) => placeLabelOf(platformRegion, code),
    [platformRegion]
  );

  const open = useCallback(
    (code: string) => {
      setPicked({ region, code });
      router.push({ pathname: '/regions/[region]/[code]', params: { region, code } });
    },
    [region, router]
  );

  // A link into the tab: its region becomes the browsed one, its state or province opens, once
  // the account is known (a pick belongs to an account). The link is then used up: its parameters
  // are cleared, so the same link tapped again is a new link and works again.
  const linkedRegion = typeof params.region === 'string' ? params.region : undefined;
  const linkedPlace = typeof params.subdivision === 'string' ? params.subdivision : undefined;
  const hasLink = linkedRegion !== undefined || linkedPlace !== undefined;
  const link = `${linkedRegion ?? ''}|${linkedPlace ?? ''}`;
  // The link being followed, until its parameters are gone (the effect may run again meanwhile).
  const followed = useRef<string | null>(null);
  const regionsAnswered = !regions.isPending;
  useEffect(() => {
    if (!hasLink) {
      followed.current = null;
      return;
    }
    if (!ready || link === followed.current) {
      return;
    }
    // The region of the link: the browsed one when the link names none; none when it names
    // something the app could not ask for, or a region that does not exist.
    let target: string | null = region;
    if (linkedRegion !== undefined) {
      if (!isRegionCode(linkedRegion)) {
        target = null;
      } else if (knows(linkedRegion)) {
        target = linkedRegion;
      } else if (!regionsAnswered) {
        // Not one of the regions the app ships: the server's list will say whether it exists.
        return;
      } else {
        target = null;
      }
    }
    followed.current = link;
    navigation.setParams({ region: undefined, subdivision: undefined });
    if (target === null) {
      return;
    }
    if (target !== region) {
      select(target);
    }
    const code = placeCodeFrom(linkedPlace);
    if (code) {
      setPicked({ region: target, code });
      setLinkedOpening({ region: target, code });
    }
  }, [
    hasLink,
    knows,
    link,
    linkedPlace,
    linkedRegion,
    navigation,
    ready,
    region,
    regionsAnswered,
    select,
  ]);

  // The place of a link opens once the link has left the tab's address, and one turn later. On
  // the web the address of the tab's history entry is rewritten first (to the tab without the
  // link), so "back" from the place comes back to the tab; opened in the same turn, the entry
  // kept the link, and "back" followed it again: the place could not be left.
  useEffect(() => {
    if (hasLink || !linkedOpening) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setLinkedOpening(null);
      router.push({ pathname: '/regions/[region]/[code]', params: linkedOpening });
    }, 0);
    return () => clearTimeout(timer);
  }, [hasLink, linkedOpening, router]);

  // Outlined on the map and marked in the list while its region is shown: the place opened last,
  // by hand or by a link.
  const selected = picked && picked.region === region ? picked.code : null;

  let status: string;
  if (counts.data) {
    status = `${binderCountLabel(counts.data.total)} in ${name}`;
  } else if (counts.error) {
    status = 'Binder counts could not load';
  } else {
    status = 'Counting binders…';
  }

  const chrome = (
    <View
      style={styles.chrome}
      onLayout={(event) => setChromeHeight(Math.round(event.nativeEvent.layout.height))}
      testID="map-chrome"
    >
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
      {withoutLocation && !promptDismissed ? (
        <View
          style={[styles.prompt, { backgroundColor: palette.surface, borderColor: palette.border }]}
          testID="map-location-prompt"
        >
          <View style={styles.promptHead}>
            <Text
              accessibilityRole="header"
              style={[
                textStyle('md', 'heading'),
                styles.grow,
                styles.title,
                { color: palette.ink },
              ]}
            >
              Where are you?
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              accessibilityHint="Hides this prompt until you open the app again"
              onPress={() => setPromptDismissed(true)}
              hitSlop={8}
              testID="map-location-dismiss"
              style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="close" size={20} color={palette.textMuted} />
            </Pressable>
          </View>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            Say which state or province you are in, and collectors of your region can find your
            public binders here.
          </Text>
          <Button
            label="Choose my location"
            icon="map-marker-outline"
            onPress={() => router.push('/settings/location')}
            style={styles.small}
            testID="map-choose-location"
          />
        </View>
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
          loaded={regions.data !== undefined}
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
          ref={page}
          // A finger dragged over the whole region scrolls the page; the page only stands still
          // while the map keeps the gesture (a zoomed-in map under a finger, a pinch).
          scrollEnabled={!mapKeepsTouch}
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
            nameOf={nameOf}
            onTouching={setMapKeepsTouch}
            pending={pageHeight === 0 || chromeHeight === 0}
            style={{ height: mapFrameHeight(pageHeight, chromeHeight + spacing[3]) }}
          />
          <MapLegend />
          <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="map-hint">
            Tap a state or province to see its public binders, or hold it to see its name first.
            Pinch or use the buttons to look closer, then drag to move the map. Every place is also
            in the list.
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
  prompt: { gap: spacing[2], padding: spacing[3], borderRadius: radius.md, borderWidth: 1 },
  promptHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  dismiss: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
