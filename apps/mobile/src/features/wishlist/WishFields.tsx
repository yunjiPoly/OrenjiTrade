import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PrintingSummary, WishPriceTerm } from '@/src/api/types';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { PillButton } from '@/src/components/ui/PillButton';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { fontWeight, useTheme } from '@/src/theme';

import { WISH_COPY as COPY } from './wishCopy';
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

/** A term's chip key (`85`, `100-plus`): its id in the chips (`wish-term-85`). */
export function termKey(term: Pick<WishPriceTerm, 'percent' | 'orMore'>): string {
  return `${term.percent}${term.orMore ? '-plus' : ''}`;
}

/** The chip of "No price". */
export const NO_PRICE = 'none';

export interface PriceChip {
  value: string;
  label: string;
}

/**
 * The price chips (mockup v50 screens 64 and 65): "No price", then the server's terms in their
 * order, the terms alone. The chosen term's approximate amount for a chosen printing is said in the
 * sentence under them ("85% TCG ≈ 21.25 USD for this printing."): on the chips the amounts made
 * them four rows and repeated that sentence (R14 review fix 1, U7).
 */
export function priceChips(terms: readonly WishPriceTerm[], current: string): PriceChip[] {
  return [
    { value: NO_PRICE, label: COPY.noPrice },
    ...withCurrentTerm(terms, current).map((term) => ({ value: termKey(term), label: term.label })),
  ];
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
 * The wish form's fields (mockup v50 screens 64 and 65, stage R14; stage S2's rules): which copy
 * (any printing, any printing of one rarity, or one printing; the chosen printing written out in
 * full under the field), "Near Mint only" in its card, the price as one-choice chips ("No price",
 * then the server's terms alone; the chosen term's amount for a chosen printing in the sentence
 * under them), and the public note (≤ 280). Inline validation messages.
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
  const offered = withCurrentTerm(terms, value.priceTerm);
  const chips = priceChips(terms, value.priceTerm);
  const chosen = offered.find((term) => term.label === value.priceTerm) ?? null;
  const chosenAmount = chosen ? approximateAmount(chosen, price) : null;

  return (
    <View style={styles.root} testID="wish-fields">
      <View style={styles.field} testID="wish-copy-section">
        <SelectSheet
          label={COPY.whichCopy}
          options={copyOptions(printings, sharedCode)}
          value={copyValue(value)}
          onChange={(next) => onChange(withCopy(value, next))}
          disabled={disabled}
          testID="wish-copy"
        />
        <Text style={[styles.hint, { color: palette.textMuted }]} testID="wish-copy-hint">
          {copyHint(value, printings, sharedCode)}
        </Text>
        {errors.printingId || errors.rarity ? (
          <Text accessibilityRole="alert" style={[styles.hint, { color: palette.danger }]}>
            {errors.printingId ?? errors.rarity}
          </Text>
        ) : null}
      </View>

      <View
        style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={COPY.nearMint}
          accessibilityHint={COPY.nearMintHint}
          aria-checked={value.nearMintOnly}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={() => set('nearMintOnly', !value.nearMintOnly)}
          testID="wish-near-mint"
          style={({ pressed }) => [styles.check, pressed && styles.pressed]}
        >
          <View
            style={[
              styles.box,
              {
                borderColor: value.nearMintOnly ? palette.primary : palette.textDisabled,
                backgroundColor: value.nearMintOnly ? palette.primary : 'transparent',
              },
            ]}
          >
            {value.nearMintOnly ? (
              <MaterialCommunityIcons name="check" size={15} color={palette.onPrimary} />
            ) : null}
          </View>
          <View style={styles.words}>
            <Text style={[styles.checkLabel, { color: palette.ink }]}>{COPY.nearMint}</Text>
            <Text style={[styles.hint, { color: palette.textMuted }]}>{COPY.nearMintHint}</Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.field} testID="wish-terms">
        <ChoiceChips
          label={COPY.price}
          variant="pill"
          options={chips}
          value={chosen ? termKey(chosen) : NO_PRICE}
          onChange={(key) => {
            const term = offered.find((candidate) => termKey(candidate) === key);
            set('priceTerm', term ? term.label : '');
          }}
          disabled={disabled}
          testID="wish-term"
        />
        <Text style={[styles.hint, { color: palette.textMuted }]} testID="wish-terms-hint">
          {COPY.priceHint}
        </Text>
        {source ? (
          <Text style={[styles.hint, { color: palette.textMuted }]} testID="wish-terms-source">
            {chosen && chosenAmount
              ? `${COPY.priceAmount(chosen.label, chosenAmount)} ${source}.`
              : `${source}.`}
          </Text>
        ) : null}
        {termsError && !terms.length ? (
          <View style={styles.termsError} testID="wish-terms-error">
            <Text accessibilityRole="alert" style={[styles.hint, { color: palette.danger }]}>
              {COPY.termsError}
            </Text>
            {onRetryTerms ? (
              <PillButton
                label={COPY.tryAgain}
                variant="outline"
                onPress={onRetryTerms}
                testID="wish-terms-retry"
              />
            ) : null}
          </View>
        ) : null}
        {errors.priceTerm ? (
          <Text accessibilityRole="alert" style={[styles.hint, { color: palette.danger }]}>
            {errors.priceTerm}
          </Text>
        ) : null}
      </View>

      <TextField
        label={COPY.note}
        labelAside={COPY.noteCount(noteLength(value.note), WISH_NOTE_MAX)}
        value={value.note}
        onChangeText={(next) => set('note', next)}
        placeholder={COPY.notePlaceholder}
        multiline
        maxLength={WISH_NOTE_MAX * 2}
        error={errors.note}
        hint={COPY.noteHint}
        editable={!disabled}
        inputStyle={styles.note}
        textAlignVertical="top"
        testID="wish-note"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  field: { gap: 6 },
  hint: { fontSize: 12, lineHeight: 17 },
  card: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 2 },
  check: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: 44,
    paddingVertical: 8,
  },
  box: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  words: { flex: 1, gap: 2 },
  checkLabel: { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.medium },
  note: { minHeight: 72 },
  termsError: { gap: 8, alignItems: 'flex-start' },
  pressed: { opacity: 0.8 },
});
