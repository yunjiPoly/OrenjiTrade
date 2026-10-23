import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useRegions } from '@/src/api/hooks/regions';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage, SwitchRow } from '@/src/components/ui/FormControls';
import { SelectSheet, type SelectOption } from '@/src/components/ui/SelectSheet';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { TextField } from '@/src/components/ui/TextField';
import { CITY_MAX_LENGTH } from '@/src/lib/place';
import { radius, useStackedRows, useTheme } from '@/src/theme';

import {
  countriesOf,
  countryOf,
  isWholeCountry,
  missingField,
  withCountry,
  withRegion,
  type LocationDraft,
} from './locationDraft';

export interface LocationFieldsProps {
  value: LocationDraft;
  onChange: (draft: LocationDraft) => void;
  /** Show what is missing (after a save attempt). */
  showErrors?: boolean;
  disabled?: boolean;
  /** The welcome's "Show me on the map", in the card under "Show my city on my profile". */
  extraSwitch?: ReactNode;
  /** The line under the city (Settings › Location words it its own way). */
  cityHint?: string;
  /**
   * Where the country and state or province pickers start, from the top of these fields (what is
   * missing shows right under them), so the welcome can scroll them into view when Finish finds
   * one empty.
   */
  onPickersLayout?: (y: number) => void;
}

/**
 * "Where are you?" (ADR 0017, the web's `app-location-fields`): platform region → country →
 * state or province pickers fed by `GET /regions` (the country and the state or province side by
 * side, mockup v50 screens 42 and 49), an optional city (shown on the collector's own profile
 * only) and "show my city on my profile" in a card. No map, no GPS, no geocoding.
 */
export function LocationFields({
  value,
  onChange,
  showErrors,
  disabled,
  extraSwitch,
  cityHint = 'Only shown on your profile, never used to locate you.',
  onPickersLayout,
}: LocationFieldsProps) {
  const { palette } = useTheme();
  const regions = useRegions();
  const stacked = useStackedRows();

  if (regions.isPending) {
    return <SkeletonList rows={3} rowHeight={52} />;
  }
  if (!regions.data) {
    return (
      <ErrorState
        title="We could not load the list of places"
        error={regions.error}
        onRetry={() => void regions.refetch()}
        compact
      />
    );
  }
  const all = regions.data.regions;
  const regionOptions: SelectOption<string>[] = all.map((region) => ({
    value: region.code,
    label: region.name,
  }));
  const countryOptions: SelectOption<string>[] = [
    { value: '', label: 'Choose a country' },
    ...countriesOf(all, value.regionCode).map((country) => ({
      value: country.code,
      label: country.name,
    })),
  ];
  const country = countryOf(all, value.countryCode);
  const subdivisionOptions: SelectOption<string>[] = [
    { value: '', label: 'Choose a state or province' },
    ...(country?.subdivisions ?? []).map((subdivision) => ({
      value: subdivision.code,
      label: subdivision.name,
    })),
  ];
  const missing = showErrors ? missingField(value) : null;

  const regionSelect = (
    <SelectSheet
      label="Region"
      options={regionOptions}
      value={value.regionCode}
      onChange={(regionCode) => onChange(withRegion(value, regionCode))}
      disabled={disabled}
      testID="location-region"
    />
  );
  const countrySelect = (
    <SelectSheet
      label="Country"
      options={countryOptions}
      value={value.countryCode}
      onChange={(countryCode) => onChange(withCountry(value, all, countryCode))}
      disabled={disabled}
      testID="location-country"
    />
  );
  const subdivisionSelect =
    country && !isWholeCountry(country) ? (
      <SelectSheet
        label="State or province"
        options={subdivisionOptions}
        value={value.subdivisionCode}
        onChange={(subdivisionCode) => onChange({ ...value, subdivisionCode })}
        disabled={disabled}
        testID="location-subdivision"
      />
    ) : null;
  const cityField = (
    <TextField
      label="City (optional)"
      hint={cityHint}
      value={value.city}
      maxLength={CITY_MAX_LENGTH}
      autoComplete="off"
      editable={!disabled}
      onChangeText={(city) => onChange({ ...value, city })}
      testID="location-city"
    />
  );
  const showCitySwitch = (
    <SwitchRow
      label="Show my city on my profile"
      value={value.showCity}
      onChange={(showCity) => onChange({ ...value, showCity })}
      disabled={disabled}
      testID="location-show-city"
    />
  );
  const missingMessage = missing ? (
    <FormMessage testID="location-missing">{missing}</FormMessage>
  ) : null;

  return (
    <View style={styles.welcome} testID="location-fields">
      {regionSelect}
      {/* What is missing shows under the pickers it is about, not under the switches the
          pinned Finish bar covered (stage R12's review fix 1). */}
      <View
        style={styles.welcome}
        onLayout={(event) => onPickersLayout?.(event.nativeEvent.layout.y)}
        testID="location-pickers"
      >
        {subdivisionSelect && !stacked ? (
          <View style={styles.pair}>
            <View style={styles.half}>{countrySelect}</View>
            <View style={styles.half}>{subdivisionSelect}</View>
          </View>
        ) : (
          <>
            {countrySelect}
            {subdivisionSelect}
          </>
        )}
        {missingMessage}
      </View>
      {cityField}
      <View
        style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <View style={styles.cardRow}>{showCitySwitch}</View>
        {extraSwitch ? (
          <View style={[styles.cardRow, { borderTopWidth: 1, borderTopColor: palette.border }]}>
            {extraSwitch}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  welcome: { gap: 14 },
  pair: { flexDirection: 'row', gap: 10 },
  half: { flex: 1, minWidth: 0 },
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  cardRow: { paddingHorizontal: 14 },
});
