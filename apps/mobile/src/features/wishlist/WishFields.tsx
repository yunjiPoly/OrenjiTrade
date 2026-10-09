import { StyleSheet, Text, View } from 'react-native';

import type { PrintingSummary, WishPriceTerm } from '@/src/api/types';
import { Checkbox } from '@/src/components/ui/FormControls';
import { SectionCard } from '@/src/components/ui/Layout';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { TextField } from '@/src/components/ui/TextField';
import { spacing, textStyle, useTheme } from '@/src/theme';

import {
  WISH_NOTE_MAX,
  copyOptions,
  copyValue,
  noteLength,
  withCopy,
  type WishFormErrors,
  type WishFormValue,
} from './wishForm';
import { approximateAmount, marketPriceSource } from './wishlistLabels';

export interface WishFieldsProps {
  value: WishFormValue;
  onChange: (value: WishFormValue) => void;
  errors: WishFormErrors;
  printings: readonly PrintingSummary[];
  terms: readonly WishPriceTerm[];
  termsError?: boolean;
  disabled?: boolean;
}

/**
 * The wish form's fields (stage S2, web: `app-wish-fields` + the printing picker): the public
 * note first, "Near Mint only", at most one price term (with its approximate amount when one
 * printing with a market price is chosen) and which copy (a simple chooser: any printing, any
 * printing of one rarity, or one printing). Inline validation messages.
 */
export function WishFields({
  value,
  onChange,
  errors,
  printings,
  terms,
  termsError = false,
  disabled = false,
}: WishFieldsProps) {
  const { palette } = useTheme();
  const set = <K extends keyof WishFormValue>(key: K, next: WishFormValue[K]) =>
    onChange({ ...value, [key]: next });
  const printing = printings.find((candidate) => candidate.id === value.printingId) ?? null;
  const price = printing?.marketPrice ?? null;
  const source = marketPriceSource(price);

  return (
    <View style={styles.root} testID="wish-fields">
      <TextField
        label="Public note (optional)"
        value={value.note}
        onChangeText={(next) => set('note', next)}
        multiline
        maxLength={WISH_NOTE_MAX * 2}
        error={errors.note}
        hint={`Everyone who can see your wishlist sees this note. ${noteLength(value.note)} / ${WISH_NOTE_MAX}`}
        editable={!disabled}
        testID="wish-note"
      />
      <Checkbox
        label="Near Mint only"
        checked={value.nearMintOnly}
        onChange={(next) => set('nearMintOnly', next)}
        disabled={disabled}
        testID="wish-near-mint"
      />

      <SectionCard title="Price (optional, at most one)" testID="wish-terms">
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          {source
            ? `Terms relative to the market price of this printing (${source}). Sellers see them; they never filter anything.`
            : 'Terms relative to the TCG market price of the copy you get. Sellers see them; they never filter anything.'}
        </Text>
        {terms.map((term) => {
          const amount = approximateAmount(term, price);
          const label = amount ? `${term.label} ${amount}` : term.label;
          return (
            <Checkbox
              key={term.label}
              label={label}
              checked={value.priceTerm === term.label}
              onChange={(checked) =>
                set(
                  'priceTerm',
                  checked ? term.label : value.priceTerm === term.label ? '' : value.priceTerm
                )
              }
              disabled={disabled}
              testID={`wish-term-${term.percent}${term.orMore ? '-plus' : ''}`}
            />
          );
        })}
        {termsError && !terms.length ? (
          <Text accessibilityRole="alert" style={[textStyle('xs'), { color: palette.danger }]}>
            The price terms could not load. Try again later.
          </Text>
        ) : null}
        {errors.priceTerm ? (
          <Text accessibilityRole="alert" style={[textStyle('xs'), { color: palette.danger }]}>
            {errors.priceTerm}
          </Text>
        ) : null}
      </SectionCard>

      <SectionCard title="Which copy" testID="wish-copy-section">
        <SelectSheet
          label="Which copy"
          options={copyOptions(printings)}
          value={copyValue(value)}
          onChange={(next) => onChange(withCopy(value, next))}
          disabled={disabled}
          testID="wish-copy"
        />
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          {value.printingId
            ? 'Only this printing.'
            : value.rarity
              ? `Any printing in ${value.rarity}.`
              : 'Any printing of the card.'}
        </Text>
        {errors.printingId || errors.rarity ? (
          <Text accessibilityRole="alert" style={[textStyle('xs'), { color: palette.danger }]}>
            {errors.printingId ?? errors.rarity}
          </Text>
        ) : null}
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
});
