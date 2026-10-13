import { StyleSheet, Text, View } from 'react-native';

import { useRegions } from '@/src/api/hooks/regions';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage, SwitchRow } from '@/src/components/ui/FormControls';
import { SelectSheet, type SelectOption } from '@/src/components/ui/SelectSheet';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { TextField } from '@/src/components/ui/TextField';
import { CITY_MAX_LENGTH } from '@/src/lib/place';
import { spacing, textStyle, useTheme } from '@/src/theme';

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
}

/**
 * "Where are you?" (ADR 0017, the web's `app-location-fields`): platform region → country →
 * state or province pickers fed by `GET /regions`, an optional city (shown on the collector's own
 * profile only) and "show my city on my profile". No map, no GPS, no geocoding.
 */
export function LocationFields({ value, onChange, showErrors, disabled }: LocationFieldsProps) {
  const { palette } = useTheme();
  const regions = useRegions();

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

  return (
    <View style={styles.root} testID="location-fields">
      <SelectSheet
        label="Region"
        options={regionOptions}
        value={value.regionCode}
        onChange={(regionCode) => onChange(withRegion(value, regionCode))}
        disabled={disabled}
        testID="location-region"
      />
      <SelectSheet
        label="Country"
        options={countryOptions}
        value={value.countryCode}
        onChange={(countryCode) => onChange(withCountry(value, all, countryCode))}
        disabled={disabled}
        testID="location-country"
      />
      {country && !isWholeCountry(country) ? (
        <SelectSheet
          label="State or province"
          options={subdivisionOptions}
          value={value.subdivisionCode}
          onChange={(subdivisionCode) => onChange({ ...value, subdivisionCode })}
          disabled={disabled}
          testID="location-subdivision"
        />
      ) : null}
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
      <SwitchRow
        label="Show my city on my profile"
        value={value.showCity}
        onChange={(showCity) => onChange({ ...value, showCity })}
        disabled={disabled}
        testID="location-show-city"
      />
      <Text
        style={[textStyle('sm'), { color: palette.textMuted }]}
        testID="location-show-city-hint"
      >
        {value.showCity
          ? 'Your city appears on your profile only. Everywhere else, others see your state or province and your country.'
          : 'Your city stays private. Others see your state or province and your country.'}
      </Text>
      {missing ? <FormMessage testID="location-missing">{missing}</FormMessage> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[3] },
});
