import { StyleSheet, Text, View } from 'react-native';

import type { GameSchema, PrintingSummary } from '@/src/api/types';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { SwitchRow } from '@/src/components/ui/FormControls';
import { SectionCard } from '@/src/components/ui/Layout';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { TextField } from '@/src/components/ui/TextField';
import { editionLabel, languageName } from '@/src/lib/catalog';
import { CURRENCIES, conditionLabel } from '@/src/lib/inventory';
import { spacing, textStyle, useTheme } from '@/src/theme';

import { ANY, WISH_NOTES_MAX, type WishFormErrors, type WishFormValue } from './wishForm';
import { TRADE_PREFERENCES, printingOptionLabel, tradePreferenceInfo } from './wishlistLabels';

/** Options of a schema list, keeping the current value even if the schema does not list it. */
function withCurrent(options: readonly string[] | undefined, current: string): string[] {
  const list = [...(options ?? [])];
  if (current && !list.includes(current)) {
    list.unshift(current);
  }
  return list;
}

export interface WishCriteriaFieldsProps {
  value: WishFormValue;
  onChange: (value: WishFormValue) => void;
  errors: WishFormErrors;
  schema: GameSchema | null;
  printings: readonly PrintingSummary[];
  disabled?: boolean;
}

/**
 * Every criterion of a wish (the web's `app-wish-criteria-fields`): printing or any, minimum
 * condition, edition, language and rarity from the game's `GameSchema`, maximum price and
 * currency, what the collector accepts (trade / buy), private notes and the alert switch. A wish
 * matches listings of the collector's own region (ADR 0017): no radius. Inline validation
 * messages.
 */
export function WishCriteriaFields({
  value,
  onChange,
  errors,
  schema,
  printings,
  disabled = false,
}: WishCriteriaFieldsProps) {
  const { palette } = useTheme();
  const set = <K extends keyof WishFormValue>(key: K, next: WishFormValue[K]) =>
    onChange({ ...value, [key]: next });
  const anyPrinting = !value.printingId;

  const printingOptions = [
    { value: ANY, label: 'Any printing' },
    ...printings
      .filter((printing): printing is PrintingSummary & { id: string } => !!printing.id)
      .map((printing) => ({ value: printing.id, label: printingOptionLabel(printing) })),
  ];
  const conditionOptions = [
    { value: ANY, label: 'Any condition' },
    ...withCurrent(schema?.conditions, value.conditionMin).map((entry) => ({
      value: entry,
      label: `${conditionLabel(entry)} or better`,
    })),
  ];
  const editionOptions = [
    { value: ANY, label: 'Any edition' },
    ...withCurrent(schema?.editions, value.edition).map((entry) => ({
      value: entry,
      label: editionLabel(entry),
    })),
  ];
  const languageOptions = [
    { value: ANY, label: 'Any language' },
    ...withCurrent(schema?.languages, value.language).map((entry) => ({
      value: entry,
      label: languageName(entry),
    })),
  ];
  const rarityOptions = [
    { value: ANY, label: 'Any rarity' },
    ...withCurrent(schema?.rarities, value.rarity).map((entry) => ({ value: entry, label: entry })),
  ];
  const currencyOptions = withCurrent(CURRENCIES, value.currency).map((entry) => ({
    value: entry,
    label: entry,
  }));

  return (
    <View style={styles.root} testID="wish-criteria">
      <SectionCard title="Which copy">
        <SelectSheet
          label="Printing"
          options={printingOptions}
          value={value.printingId}
          onChange={(next) => set('printingId', next)}
          disabled={disabled}
          testID="wish-printing"
        />
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          {anyPrinting ? 'Every printing of the card matches.' : 'Only this printing matches.'}
        </Text>
        <SelectSheet
          label="Minimum condition"
          options={conditionOptions}
          value={value.conditionMin}
          onChange={(next) => set('conditionMin', next)}
          disabled={disabled}
          testID="wish-condition"
        />
        <SelectSheet
          label="Edition"
          options={editionOptions}
          value={value.edition}
          onChange={(next) => set('edition', next)}
          disabled={disabled}
          testID="wish-edition"
        />
        <SelectSheet
          label="Language"
          options={languageOptions}
          value={value.language}
          onChange={(next) => set('language', next)}
          disabled={disabled}
          testID="wish-language"
        />
        {anyPrinting ? (
          <SelectSheet
            label="Rarity"
            options={rarityOptions}
            value={value.rarity}
            onChange={(next) => set('rarity', next)}
            disabled={disabled}
            testID="wish-rarity"
          />
        ) : null}
      </SectionCard>

      <SectionCard title="Deal">
        <View style={styles.priceRow}>
          <TextField
            label="Maximum price"
            value={value.maxPrice}
            onChangeText={(next) => set('maxPrice', next)}
            keyboardType="decimal-pad"
            placeholder="Optional"
            error={errors.maxPrice}
            editable={!disabled}
            containerStyle={styles.grow}
            testID="wish-max-price"
          />
          <View style={styles.currency}>
            <SelectSheet
              label="Currency"
              options={currencyOptions}
              value={value.currency}
              onChange={(next) => set('currency', next)}
              disabled={disabled}
              testID="wish-currency"
            />
          </View>
        </View>
        {errors.currency ? (
          <Text accessibilityRole="alert" style={[textStyle('xs'), { color: palette.danger }]}>
            {errors.currency}
          </Text>
        ) : null}
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          Listings without a price still match; prices in another currency do not.
        </Text>
        <ChoiceChips
          label="I want to"
          options={TRADE_PREFERENCES.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          value={value.tradePreference}
          onChange={(next) => set('tradePreference', next)}
          disabled={disabled}
          hint={tradePreferenceInfo(value.tradePreference).hint}
          testID="wish-trade"
        />
      </SectionCard>

      <SectionCard title="Notes and alerts">
        <TextField
          label="Private notes"
          value={value.notes}
          onChangeText={(next) => set('notes', next)}
          multiline
          maxLength={WISH_NOTES_MAX + 1}
          error={errors.notes}
          hint={`Only you can see these. ${value.notes.length} / ${WISH_NOTES_MAX}`}
          editable={!disabled}
          testID="wish-notes"
        />
        <SwitchRow
          label="Match alerts on"
          help={
            value.active
              ? 'We notify you when a collector of your region lists a match.'
              : 'Paused: this wish does not match or notify until you turn it back on.'
          }
          value={value.active}
          onChange={(next) => set('active', next)}
          disabled={disabled}
          testID="wish-active"
        />
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  priceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  grow: { flex: 1 },
  currency: { width: 120, paddingTop: 22 },
});
