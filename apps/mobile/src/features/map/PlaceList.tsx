import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useScrollToTop } from 'expo-router';
import { memo, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';

import type { PlatformRegion } from '@/src/api/types';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SwitchRow } from '@/src/components/ui/FormControls';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { listPlaces, type ListedCountry, type ListedPlace } from './places';
import { binderCountLabel } from './shading';

export interface PlaceListProps {
  /** The region of `GET /regions`; null until it answered, or when it does not list the region. */
  region: PlatformRegion | null;
  /** `GET /regions` answered: a missing region is then an empty list, not a list still loading. */
  loaded: boolean;
  /** Public binders per place code. */
  counts: ReadonlyMap<string, number>;
  /** False until the counts answered: the rows then name the places without a number. */
  countsKnown: boolean;
  /** The list of places failed to load (the retry reads it again). */
  error: unknown;
  onRetry: () => void;
  /** The place last opened. */
  selected: string | null;
  onPick: (code: string) => void;
  /** What the screen shows above the list; it scrolls away with it. */
  header: ReactElement;
  testID?: string;
}

/**
 * Every state and province of a region with its number of public binders (the web's
 * `app-subdivision-list`), grouped by country, with a filter field and "Only places with
 * binders". A first-class way into the map, not a fallback: each row is a link that opens the
 * same binders as a tap on the map, with a name screen readers can say ("Quebec, 2 public
 * binders").
 */
export function PlaceList({
  region,
  loaded,
  counts,
  countsKnown,
  error,
  onRetry,
  selected,
  onPick,
  header,
  testID = 'place-list',
}: PlaceListProps) {
  const { palette } = useTheme();
  const [text, setText] = useState('');
  const [onlyWithBinders, setOnlyWithBinders] = useState(false);
  const filtered = text.trim() !== '' || onlyWithBinders;
  const list = useRef<SectionList<ListedPlace, { country: ListedCountry }>>(null);
  // Pressing the Map tab again brings the list back to its top.
  useScrollToTop(list);
  // Another region starts at its top: its name, the switcher and the filter are on screen, not
  // the middle of a list the collector had scrolled in the region before.
  const shown = region?.code ?? null;
  useEffect(() => {
    list.current?.getScrollResponder()?.scrollTo({ y: 0, animated: false });
  }, [shown]);
  const sections = useMemo(
    () =>
      listPlaces(region, counts, { text, onlyWithBinders }).map((country) => ({
        country,
        data: country.places,
      })),
    [counts, onlyWithBinders, region, text]
  );

  const top = (
    <View style={styles.top}>
      {header}
      <Text
        accessibilityRole="header"
        style={[textStyle('lg', 'heading'), styles.strong, { color: palette.ink }]}
      >
        States and provinces
      </Text>
      <TextField
        label="Find a state or province"
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        maxLength={60}
        testID={`${testID}-filter`}
      />
      <SwitchRow
        label="Only places with binders"
        value={onlyWithBinders}
        onChange={setOnlyWithBinders}
        testID={`${testID}-only-with-binders`}
      />
    </View>
  );

  let empty: ReactElement;
  if (!region && error) {
    empty = (
      <ErrorState
        compact
        error={error}
        title="The list of places could not load"
        onRetry={onRetry}
        testID={`${testID}-error`}
      />
    );
  } else if (!region && !loaded) {
    empty = <SkeletonList rows={6} rowHeight={48} testID={`${testID}-loading`} />;
  } else {
    empty = (
      <Text
        accessibilityLiveRegion="polite"
        style={[textStyle('md'), styles.empty, { color: palette.textMuted }]}
        testID={`${testID}-empty`}
      >
        {filtered ? 'No state or province matches.' : 'No state or province in this region.'}
      </Text>
    );
  }

  return (
    <SectionList
      ref={list}
      testID={testID}
      sections={sections}
      keyExtractor={(place) => place.code}
      renderItem={({ item }) => (
        <PlaceRow
          place={item}
          countKnown={countsKnown}
          selected={item.code === selected}
          onPick={onPick}
        />
      )}
      renderSectionHeader={({ section }) => (
        <CountryHeader country={section.country} countKnown={countsKnown} />
      )}
      ListHeaderComponent={top}
      ListEmptyComponent={empty}
      stickySectionHeadersEnabled
      initialNumToRender={20}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.content}
    />
  );
}

function CountryHeader({ country, countKnown }: { country: ListedCountry; countKnown: boolean }) {
  const { palette } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={
        countKnown ? `${country.name}, ${binderCountLabel(country.count)}` : country.name
      }
      style={[styles.country, { backgroundColor: palette.background }]}
      testID={`place-country-${country.code}`}
    >
      <Text style={[textStyle('sm'), styles.countryName, { color: palette.textMuted }]}>
        {country.name}
      </Text>
      {countKnown ? (
        <Text style={[textStyle('sm'), styles.strong, { color: palette.textMuted }]}>
          {country.count}
        </Text>
      ) : null}
    </View>
  );
}

const PlaceRow = memo(function PlaceRow({
  place,
  countKnown,
  selected,
  onPick,
}: {
  place: ListedPlace;
  countKnown: boolean;
  selected: boolean;
  onPick: (code: string) => void;
}) {
  const { palette } = useTheme();
  const has = place.count > 0;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={
        countKnown ? `${place.name}, ${binderCountLabel(place.count)}` : place.name
      }
      accessibilityHint="Opens its public binders"
      aria-selected={selected}
      onPress={() => onPick(place.code)}
      testID={`place-row-${place.code}`}
      style={({ pressed }) => [
        styles.row,
        selected && { backgroundColor: palette.primaryContainer },
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          textStyle('md'),
          styles.name,
          { color: selected ? palette.onPrimaryContainer : palette.ink },
          selected && styles.strong,
        ]}
      >
        {place.name}
      </Text>
      {countKnown ? (
        <View
          style={[styles.count, has && { backgroundColor: palette.primaryContainer }]}
          testID={`place-count-${place.code}`}
        >
          <Text
            style={[
              textStyle('sm'),
              styles.strong,
              { color: has ? palette.onPrimaryContainer : palette.textMuted },
            ]}
          >
            {place.count}
          </Text>
        </View>
      ) : null}
      <MaterialCommunityIcons name="chevron-right" size={20} color={palette.textDisabled} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  content: { paddingBottom: spacing[6] },
  top: { gap: spacing[3], marginBottom: spacing[2] },
  strong: { fontWeight: fontWeight.semibold },
  empty: { paddingVertical: spacing[4] },
  // The space above a country is part of its header (padding, not margin): a header stuck to the
  // top of the list then covers the rows that scroll under it, down to the last point.
  country: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  countryName: {
    flex: 1,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 48,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
    borderRadius: radius.md,
  },
  name: { flex: 1 },
  count: {
    minWidth: 32,
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  pressed: { opacity: 0.7 },
});
