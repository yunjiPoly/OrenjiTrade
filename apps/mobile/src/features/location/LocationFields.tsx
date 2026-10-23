import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useRegions } from '@/src/api/hooks/regions';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage, SwitchRow } from '@/src/components/ui/FormControls';
import { SelectSheet, type SelectOption } from '@/src/components/ui/SelectSheet';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { CITY_MAX_LENGTH } from '@/src/lib/place';
import { radius, spacing, textStyle, useStackedRows, useTheme } from '@/src/theme';

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
  /**
   * `welcome`: the welcome's place step (mockup v50 screen 42): country and state or province side
   * by side, and the switches in one card with `extraSwitch` ("Show me on the map") under "Show my
   * city on my profile". `settings` (the default): Settings › Location as before.
   */
  variant?: 'settings' | 'welcome';
  extraSwitch?: ReactNode;
  /**
   * `welcome`: where the country and state or province pickers start, from the top of these
   * fields (what is missing shows right under them), so the welcome can scroll them into view
   * when Finish finds one empty.
   */
  onPickersLayout?: (y: number) => void;
}

/**
 * "Where are you?" (ADR 0017, the web's `app-location-fields`): platform region → country →
 * state or province pickers fed by `GET /regions`, an optional city (shown on the collector's own
 * profile only) and "show my city on my profile". No map, no GPS, no geocoding.
 */
export function LocationFields({
  value,
  onChange,
  showErrors,
  disabled,
  variant = 'settings',
  extraSwitch,
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
      hint="Only shown on your profile, never used to locate you."
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

  if (variant === 'welcome') {
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

  return (
    <View style={styles.root} testID="location-fields">
      {regionSelect}
      {countrySelect}
      {subdivisionSelect}
      {cityField}
      {showCitySwitch}
      <Text
        style={[textStyle('sm'), { color: palette.textMuted }]}
        testID="location-show-city-hint"
      >
        {value.showCity
          ? 'Your city appears on your profile only. Everywhere else, others see your state or province and your country.'
          : 'Your city stays private. Others see your state or province and your country.'}
      </Text>
      {missingMessage}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[3] },
  welcome: { gap: 14 },
  pair: { flexDirection: 'row', gap: 10 },
  half: { flex: 1, minWidth: 0 },
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  cardRow: { paddingHorizontal: 14 },
});
