import { StyleSheet, Text, View } from 'react-native';

import type { PrintingSummary, WishPriceTerm } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
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
import { approximateAmount, marketPriceSource, printingOptionLabel } from './wishlistLabels';

/**
 * The terms to offer: the admin list, plus `current` when the list no longer has it (a wish keeps
 * a term the admin removed), placed by its percent rather than at the end (web twin).
 */
export function withCurrentTerm(
  terms: readonly WishPriceTerm[],
  current: string | null | undefined
): readonly WishPriceTerm[] {
  if (!current || terms.some((term) => term.label === current)) {
    return terms;
  }
  const match = /^([1-9]\d{0,2})% TCG(\+)?$/.exec(current);
  if (!match) {
    return terms;
  }
  const kept: WishPriceTerm = { label: current, percent: Number(match[1]), orMore: !!match[2] };
  const rank = (term: WishPriceTerm) => (term.percent ?? 0) * 2 + (term.orMore ? 1 : 0);
  const after = terms.findIndex((term) => rank(term) > rank(kept));
  return after < 0 ? [...terms, kept] : [...terms.slice(0, after), kept, ...terms.slice(after)];
}

/**
 * What the "Which copy" choice means, under the field (the collapsed field cuts a long printing
 * label, so the chosen printing is written out in full here: two printings can differ only by
 * their edition). With a typed code that several printings share, it says why none was picked.
 */
export function copyHint(
  value: Pick<WishFormValue, 'printingId' | 'rarity'>,
  printings: readonly PrintingSummary[],
  sharedCode: string | null = null
): string {
  if (value.printingId) {
    const printing = printings.find((candidate) => candidate.id === value.printingId);
    return printing ? `Only ${printingOptionLabel(printing)}.` : 'Only this printing.';
  }
  const any = value.rarity ? `Any printing in ${value.rarity}.` : 'Any printing of the card.';
  const sharing = sharedCode
    ? printings.filter((printing) => printing.printingCode === sharedCode).length
    : 0;
  return sharing > 1
    ? `${any} ${sharing} printings share the code ${sharedCode}: choose one in “Which copy” for that copy only.`
    : any;
}

export interface WishFieldsProps {
  value: WishFormValue;
  onChange: (value: WishFormValue) => void;
  errors: WishFormErrors;
  printings: readonly PrintingSummary[];
  /** A typed printing code that several printings share ("Which copy" lists them first). */
  sharedCode?: string | null;
  terms: readonly WishPriceTerm[];
  termsError?: boolean;
  /** Loads the price terms again (after `termsError`). */
  onRetryTerms?: () => void;
  disabled?: boolean;
}

/**
 * The wish form's fields (stage S2, web: `app-wish-fields` + the printing picker): the public
 * note first, "Near Mint only", at most one price term (with its approximate amount when one
 * printing with a market price is chosen) and which copy (a simple chooser: any printing, any
 * printing of one rarity, or one printing; the chosen printing is written out in full under the
 * field). Inline validation messages.
 */
export function WishFields({
  value,
  onChange,
  errors,
  printings,
  sharedCode = null,
  terms,
  termsError = false,
  onRetryTerms,
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
        {withCurrentTerm(terms, value.priceTerm).map((term) => {
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
          <View style={styles.termsError} testID="wish-terms-error">
            <Text accessibilityRole="alert" style={[textStyle('xs'), { color: palette.danger }]}>
              The price terms could not load.
            </Text>
            {onRetryTerms ? (
              <Button
                label="Try again"
                variant="secondary"
                onPress={onRetryTerms}
                testID="wish-terms-retry"
              />
            ) : null}
          </View>
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
          options={copyOptions(printings, sharedCode)}
          value={copyValue(value)}
          onChange={(next) => onChange(withCopy(value, next))}
          disabled={disabled}
          testID="wish-copy"
        />
        <Text style={[textStyle('xs'), { color: palette.textMuted }]} testID="wish-copy-hint">
          {copyHint(value, printings, sharedCode)}
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
  termsError: { gap: spacing[2], alignItems: 'flex-start' },
});
