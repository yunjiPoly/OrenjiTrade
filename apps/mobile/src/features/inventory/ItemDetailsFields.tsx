import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { BinderResponse, GameSchema } from '@/src/api/types';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { SwitchRow } from '@/src/components/ui/FormControls';
import { SectionCard } from '@/src/components/ui/Layout';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { TextField } from '@/src/components/ui/TextField';
import { editionLabel, finishLabel, languageName } from '@/src/lib/catalog';
import {
  AVAILABILITIES,
  AVAILABILITY_LABELS,
  CARD_CONDITIONS,
  conditionLabel,
  CURRENCIES,
  endsLabel,
  TEMPORARY_DURATIONS,
  VISIBILITIES,
  VISIBILITY_INFO,
} from '@/src/lib/inventory';
import { spacing, textStyle, useTheme } from '@/src/theme';

import {
  KEEP_END,
  NOTES_MAX,
  PUBLIC_NOTES_MAX,
  withCurrent,
  type DurationChoice,
  type ItemFormErrors,
  type ItemFormValue,
} from './itemForm';

const UNFILED = '__unfiled__';

export interface ItemDetailsFieldsProps {
  value: ItemFormValue;
  onChange: (patch: Partial<ItemFormValue>) => void;
  errors: ItemFormErrors;
  schema: GameSchema | null | undefined;
  binders: readonly BinderResponse[];
  /** End of the running temporary publication (edit only): offers "Keep current end". */
  currentPublicUntil?: string | null;
  disabled?: boolean;
}

/**
 * The fields of an inventory item, grouped like the web's `app-item-details-fields`: the card
 * (copies, condition, language, edition, finish from the game schema), the listing (trade / sale
 * intent, offers, asking price), visibility and binder, and notes.
 */
export function ItemDetailsFields({
  value,
  onChange,
  errors,
  schema,
  binders,
  currentPublicUntil,
  disabled = false,
}: ItemDetailsFieldsProps) {
  const { palette } = useTheme();
  const conditions = withCurrent(
    schema?.conditions?.length ? schema.conditions : CARD_CONDITIONS,
    value.condition
  );
  const languages = withCurrent(schema?.languages, value.language);
  const editions = withCurrent(schema?.editions, value.edition);
  const finishes = withCurrent(schema?.finishes, value.finish);
  const currencies = withCurrent(CURRENCIES, value.currency);
  const binder = value.binderId
    ? binders.find((candidate) => candidate.id === value.binderId)
    : null;
  // When the form opened: "Keep" the running publication end, if any.
  const [openedAt] = useState(() => Date.now());
  const runningEnd =
    currentPublicUntil && Date.parse(currentPublicUntil) > openedAt
      ? endsLabel(currentPublicUntil, openedAt)
      : null;
  const durations: { value: DurationChoice; label: string }[] = [
    ...(runningEnd ? [{ value: KEEP_END as DurationChoice, label: `Keep (${runningEnd})` }] : []),
    ...TEMPORARY_DURATIONS.map((option) => ({
      value: option.value as DurationChoice,
      label: option.label,
    })),
  ];

  return (
    <View style={styles.root}>
      <SectionCard title="Card">
        <TextField
          label="Copies"
          value={value.quantity}
          onChangeText={(quantity) => onChange({ quantity: quantity.replace(/[^\d]/g, '') })}
          keyboardType="number-pad"
          maxLength={4}
          error={errors.quantity}
          editable={!disabled}
          testID="item-quantity"
        />
        <ChoiceChips
          label="Condition"
          options={conditions.map((condition) => ({
            value: condition,
            label: conditionLabel(condition),
          }))}
          value={value.condition}
          onChange={(condition) => onChange({ condition })}
          error={errors.condition}
          disabled={disabled}
          testID="item-condition"
        />
        {languages.length > 0 ? (
          <ChoiceChips
            label="Language"
            options={languages.map((language) => ({
              value: language,
              label: languageName(language),
            }))}
            value={value.language}
            onChange={(language) => onChange({ language })}
            disabled={disabled}
            testID="item-language"
          />
        ) : null}
        {editions.length > 0 ? (
          <ChoiceChips
            label="Edition"
            options={editions.map((edition) => ({ value: edition, label: editionLabel(edition) }))}
            value={value.edition}
            onChange={(edition) => onChange({ edition })}
            disabled={disabled}
            testID="item-edition"
          />
        ) : null}
        {finishes.length > 0 ? (
          <ChoiceChips
            label="Finish"
            options={finishes.map((finish) => ({ value: finish, label: finishLabel(finish) }))}
            value={value.finish}
            onChange={(finish) => onChange({ finish })}
            disabled={disabled}
            testID="item-finish"
          />
        ) : null}
      </SectionCard>

      <SectionCard
        title="Listing"
        description="Trade, sell or keep it: what collectors may ask you for."
      >
        <ChoiceChips
          label="Available for"
          options={AVAILABILITIES.map((availability) => ({
            value: availability,
            label: AVAILABILITY_LABELS[availability],
          }))}
          value={value.availability}
          onChange={(availability) => onChange({ availability })}
          disabled={disabled}
          testID="item-availability"
        />
        <SwitchRow
          label="Accepts offers"
          help="Collectors may propose a price or a trade for this card."
          value={value.acceptsOffers}
          onChange={(acceptsOffers) => onChange({ acceptsOffers })}
          disabled={disabled}
          testID="item-accepts-offers"
        />
        <TextField
          label="Asking price (optional)"
          value={value.askingPrice}
          onChangeText={(askingPrice) => onChange({ askingPrice })}
          keyboardType="decimal-pad"
          placeholder="0.00"
          maxLength={14}
          error={errors.askingPrice}
          editable={!disabled}
          testID="item-price"
        />
        <ChoiceChips
          label="Currency"
          options={currencies.map((currency) => ({ value: currency, label: currency }))}
          value={value.currency}
          onChange={(currency) => onChange({ currency })}
          error={errors.currency}
          disabled={disabled}
          testID="item-currency"
        />
      </SectionCard>

      <SectionCard title="Visibility">
        <ChoiceChips
          label="Who can see it"
          options={VISIBILITIES.map((visibility) => ({
            value: visibility,
            label: VISIBILITY_INFO[visibility].label,
          }))}
          value={value.visibility}
          onChange={(visibility) => onChange({ visibility })}
          hint={visibilityHint(value.visibility)}
          disabled={disabled}
          testID="item-visibility"
        />
        {value.visibility === 'TEMPORARILY_PUBLIC' ? (
          <ChoiceChips
            label="Public for"
            options={durations}
            value={value.duration}
            onChange={(duration) => onChange({ duration })}
            hint="Then private again automatically."
            disabled={disabled}
            testID="item-duration"
          />
        ) : null}
        <SelectSheet
          label="Binder"
          options={[
            { value: UNFILED, label: 'No binder (unfiled)' },
            ...binders.map((candidate) => ({
              value: candidate.id,
              label: candidate.name,
              detail: VISIBILITY_INFO[candidate.visibility].label,
            })),
          ]}
          value={value.binderId ?? UNFILED}
          onChange={(binderId) => onChange({ binderId: binderId === UNFILED ? null : binderId })}
          disabled={disabled}
          testID="item-binder"
        />
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          {!binder
            ? 'Unfiled cards show on their own when public.'
            : binder.visibility === 'PRIVATE'
              ? 'This binder is private: publish it to show its public cards.'
              : 'This binder is public.'}
        </Text>
      </SectionCard>

      <SectionCard title="Notes">
        <TextField
          label="Public notes"
          value={value.publicNotes}
          onChangeText={(publicNotes) => onChange({ publicNotes })}
          multiline
          maxLength={PUBLIC_NOTES_MAX}
          hint={`Shown to collectors with the card. ${value.publicNotes.length} / ${PUBLIC_NOTES_MAX}`}
          error={errors.publicNotes}
          editable={!disabled}
          testID="item-public-notes"
        />
        <TextField
          label="Private notes"
          value={value.notes}
          onChangeText={(notes) => onChange({ notes })}
          multiline
          maxLength={NOTES_MAX}
          hint="Only you can see these."
          error={errors.notes}
          editable={!disabled}
          testID="item-notes"
        />
      </SectionCard>
    </View>
  );
}

function visibilityHint(visibility: ItemFormValue['visibility']): string {
  switch (visibility) {
    case 'PRIVATE':
      return 'Private: prepare it now and publish it later. Only you can see it.';
    case 'PUBLIC':
      return 'Public: collectors near you can find it once its binder (if any) is public.';
    default:
      return 'Temporarily public: visible for the time you choose, then private again.';
  }
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
});
