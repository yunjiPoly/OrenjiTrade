import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Button } from '@/src/components/ui/Button';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { Checkbox } from '@/src/components/ui/FormControls';
import { TextField } from '@/src/components/ui/TextField';
import { editionLabel, languageName } from '@/src/lib/catalog';
import { conditionLabel } from '@/src/lib/inventory';
import { spacing, textStyle, useTheme } from '@/src/theme';

import {
  AVAILABILITY_FILTERS,
  DEFAULT_HOLDER_FILTERS,
  FALLBACK_CONDITIONS,
  FRESHNESS_FILTERS,
  HOLDER_SORTS,
  MAX_PRICE,
  activeHolderFilterCount,
  isAvailabilityFilter,
  isFreshnessFilter,
  isHolderSort,
  parsePrice,
  priceFieldError,
  priceRangeError,
  type HolderFilters,
} from './holderFilters';

const ANY = '__any__';

export interface HolderFiltersSheetProps {
  visible: boolean;
  onClose: () => void;
  filters: HolderFilters;
  /** Values of the card's game schema (fallbacks when unknown). */
  conditions?: readonly string[];
  editions?: readonly string[];
  languages?: readonly string[];
  onChange: (filters: HolderFilters) => void;
}

/**
 * Filters of the card-holders results (the web's `app-holder-filters`): sort, availability,
 * condition, a price range validated inline, freshness, edition, language and "accepts offers".
 * Choices apply at once; prices apply when valid.
 */
export function HolderFiltersSheet({
  visible,
  onClose,
  filters,
  conditions = FALLBACK_CONDITIONS,
  editions = [],
  languages = [],
  onChange,
}: HolderFiltersSheetProps) {
  const { palette } = useTheme();
  const [minText, setMinText] = useState(filters.minPrice === null ? '' : String(filters.minPrice));
  const [maxText, setMaxText] = useState(filters.maxPrice === null ? '' : String(filters.maxPrice));
  useEffect(() => {
    setMinText(filters.minPrice === null ? '' : String(filters.minPrice));
    setMaxText(filters.maxPrice === null ? '' : String(filters.maxPrice));
  }, [filters.minPrice, filters.maxPrice]);

  const minError = priceFieldError(minText);
  const maxError = priceFieldError(maxText);
  const rangeError =
    minError || maxError ? null : priceRangeError(parsePrice(minText), parsePrice(maxText));
  const active = activeHolderFilterCount(filters);

  const applyPrices = (min: string, max: string) => {
    if (priceFieldError(min) || priceFieldError(max)) {
      return;
    }
    const minPrice = parsePrice(min);
    const maxPrice = parsePrice(max);
    if (priceRangeError(minPrice, maxPrice)) {
      return;
    }
    if (minPrice !== filters.minPrice || maxPrice !== filters.maxPrice) {
      onChange({ ...filters, minPrice, maxPrice });
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filters" testID="holder-filters">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ChoiceChips
          label="Sort"
          options={HOLDER_SORTS}
          value={filters.sort}
          onChange={(value) =>
            onChange({ ...filters, sort: isHolderSort(value) ? value : 'distance' })
          }
          testID="holder-sort"
        />
        <ChoiceChips
          label="Availability"
          options={[{ value: ANY, label: 'Any availability' }, ...AVAILABILITY_FILTERS]}
          value={filters.availability ?? ANY}
          onChange={(value) =>
            onChange({ ...filters, availability: isAvailabilityFilter(value) ? value : null })
          }
          testID="holder-availability"
        />
        <ChoiceChips
          label="Condition"
          options={[
            { value: ANY, label: 'Any condition' },
            ...conditions.map((value) => ({ value, label: conditionLabel(value) })),
          ]}
          value={filters.condition ?? ANY}
          onChange={(value) => onChange({ ...filters, condition: value === ANY ? null : value })}
          testID="holder-condition"
        />
        <View style={styles.group} accessibilityLabel="Price range">
          <Text style={[textStyle('sm'), { color: palette.ink }]}>Price range</Text>
          <View style={styles.prices}>
            <TextField
              label="Min price"
              value={minText}
              onChangeText={setMinText}
              onBlur={() => applyPrices(minText, maxText)}
              onSubmitEditing={() => applyPrices(minText, maxText)}
              error={minError}
              keyboardType="decimal-pad"
              inputMode="decimal"
              containerStyle={styles.price}
              testID="holder-min-price"
            />
            <TextField
              label="Max price"
              value={maxText}
              onChangeText={setMaxText}
              onBlur={() => applyPrices(minText, maxText)}
              onSubmitEditing={() => applyPrices(minText, maxText)}
              error={maxError}
              keyboardType="decimal-pad"
              inputMode="decimal"
              containerStyle={styles.price}
              testID="holder-max-price"
            />
          </View>
          {rangeError ? (
            <Text
              accessibilityRole="alert"
              testID="holder-price-range-error"
              style={[textStyle('xs'), { color: palette.danger }]}
            >
              {rangeError}
            </Text>
          ) : (
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              Asking prices from 0 to {MAX_PRICE}; listings without a price never match.
            </Text>
          )}
        </View>
        <ChoiceChips
          label="Freshness"
          options={[{ value: ANY, label: 'Any freshness' }, ...FRESHNESS_FILTERS]}
          value={filters.freshness ?? ANY}
          onChange={(value) =>
            onChange({ ...filters, freshness: isFreshnessFilter(value) ? value : null })
          }
          testID="holder-freshness"
        />
        {editions.length > 0 ? (
          <ChoiceChips
            label="Edition"
            options={[
              { value: ANY, label: 'Any edition' },
              ...editions.map((value) => ({ value, label: editionLabel(value) })),
            ]}
            value={filters.edition ?? ANY}
            onChange={(value) => onChange({ ...filters, edition: value === ANY ? null : value })}
            testID="holder-edition"
          />
        ) : null}
        {languages.length > 0 ? (
          <ChoiceChips
            label="Language"
            options={[
              { value: ANY, label: 'Any language' },
              ...languages.map((value) => ({ value, label: languageName(value) })),
            ]}
            value={filters.language ?? ANY}
            onChange={(value) => onChange({ ...filters, language: value === ANY ? null : value })}
            testID="holder-language"
          />
        ) : null}
        <Checkbox
          label="Accepts offers"
          checked={filters.acceptsOffers}
          onChange={(checked) => onChange({ ...filters, acceptsOffers: checked })}
          testID="holder-accepts-offers"
        />
      </ScrollView>
      <View style={styles.actions}>
        <Button
          label={active > 0 ? `Clear filters (${active})` : 'Clear filters'}
          variant="ghost"
          onPress={() => onChange({ ...DEFAULT_HOLDER_FILTERS, sort: filters.sort })}
          disabled={active === 0}
          testID="holder-filters-clear"
        />
        <Button label="Show results" onPress={onClose} testID="holder-filters-done" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  content: { gap: spacing[4], paddingBottom: spacing[2] },
  group: { gap: spacing[1] },
  prices: { flexDirection: 'row', gap: spacing[2] },
  price: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[2] },
});
