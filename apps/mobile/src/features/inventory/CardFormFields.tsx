import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { BinderResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Text, TextInput } from '@/src/components/ui/Text';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

import {
  PUBLIC_NOTE_MAX,
  QUANTITY_MAX,
  QUANTITY_MIN,
  parseQuantity,
  stepQuantity,
  type CardFormErrors,
  type CardFormValue,
  type CardVisibility,
} from './cardForm';
import { CardPhotos, type CardPhotosProps } from './CardPhotos';
import { CARD_FORM_COPY } from './inventoryCopy';
import { ASKING_PRICE_MAX } from './itemPrice';

export interface CardFormFieldsProps {
  value: CardFormValue;
  onChange: (patch: Partial<CardFormValue>) => void;
  errors: CardFormErrors;
  binders: readonly BinderResponse[];
  /** The collector's region ("Americas (North)"), for the Public hint; null without a location. */
  regionName: string | null;
  photos: CardPhotosProps;
  disabled?: boolean;
}

/**
 * The fields of Add to inventory and Edit card, in the order of the spec (section 6, screen 6):
 * Copies and Asking price side by side, Who can see it, Binder, Public note, Photos. At large text
 * sizes Copies and Asking price stack.
 */
export function CardFormFields({
  value,
  onChange,
  errors,
  binders,
  regionName,
  photos,
  disabled = false,
}: CardFormFieldsProps) {
  const { palette } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;
  const [choosingBinder, setChoosingBinder] = useState(false);
  const binderName = value.binderId
    ? (binders.find((binder) => binder.id === value.binderId)?.name ?? CARD_FORM_COPY.noBinder)
    : CARD_FORM_COPY.noBinder;
  const quantity = parseQuantity(value.quantity);
  const inputStyle = [
    textStyle('md'),
    styles.input,
    { color: palette.ink, backgroundColor: palette.surface, borderColor: palette.borderStrong },
  ];

  return (
    <View style={styles.root}>
      <View style={[styles.pair, stacked && styles.stacked]}>
        <Field label={CARD_FORM_COPY.copies} error={errors.quantity} style={styles.half}>
          <View
            style={[
              styles.stepper,
              {
                backgroundColor: palette.surface,
                borderColor: errors.quantity ? palette.danger : palette.borderStrong,
              },
            ]}
          >
            <StepButton
              icon="minus"
              label={CARD_FORM_COPY.oneLess}
              disabled={disabled || !(quantity > QUANTITY_MIN)}
              onPress={() => onChange({ quantity: stepQuantity(value.quantity, -1) })}
              testID="card-quantity-less"
            />
            <TextInput
              value={value.quantity}
              onChangeText={(text) => onChange({ quantity: text.replace(/[^0-9]/g, '') })}
              keyboardType="number-pad"
              maxLength={4}
              editable={!disabled}
              accessibilityLabel={CARD_FORM_COPY.copies}
              testID="card-quantity"
              style={[textStyle('md'), styles.count, { color: palette.ink }]}
            />
            <StepButton
              icon="plus"
              label={CARD_FORM_COPY.oneMore}
              disabled={disabled || !(quantity < QUANTITY_MAX)}
              onPress={() => onChange({ quantity: stepQuantity(value.quantity, 1) })}
              testID="card-quantity-more"
            />
          </View>
        </Field>
        <Field label={CARD_FORM_COPY.askingPrice} error={errors.price} style={styles.half}>
          <TextInput
            value={value.price}
            onChangeText={(price) => onChange({ price })}
            placeholder={CARD_FORM_COPY.askingPricePlaceholder}
            placeholderTextColor={palette.textDisabled}
            // A little room for the spaces the API trims; the counter is the API's 40.
            maxLength={ASKING_PRICE_MAX + 10}
            autoCorrect={false}
            editable={!disabled}
            accessibilityLabel={CARD_FORM_COPY.askingPrice}
            accessibilityHint={CARD_FORM_COPY.askingPricePlaceholder}
            testID="card-price"
            style={[...inputStyle, errors.price ? { borderColor: palette.danger } : null]}
          />
        </Field>
      </View>

      <View style={styles.field}>
        <Text style={[textStyle('sm'), styles.label, { color: palette.ink }]}>
          {CARD_FORM_COPY.whoCanSee}
        </Text>
        <VisibilityToggle
          value={value.visibility}
          onChange={(visibility) => onChange({ visibility })}
          disabled={disabled}
        />
        <Text testID="card-visibility-hint" style={[textStyle('xs'), { color: palette.textMuted }]}>
          {value.visibility === 'PRIVATE'
            ? CARD_FORM_COPY.privateHint
            : regionName
              ? CARD_FORM_COPY.publicHint(regionName)
              : CARD_FORM_COPY.publicHintNoRegion}
        </Text>
      </View>

      <Field label={CARD_FORM_COPY.binder}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${CARD_FORM_COPY.binder}: ${binderName}`}
          accessibilityHint="Opens the choices"
          disabled={disabled}
          onPress={() => setChoosingBinder(true)}
          testID="card-binder"
          style={({ pressed }) => [
            styles.select,
            { backgroundColor: palette.surface, borderColor: palette.borderStrong },
            pressed && styles.pressed,
          ]}
        >
          <Text numberOfLines={1} style={[textStyle('md'), styles.grow, { color: palette.ink }]}>
            {binderName}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={20} color={palette.textMuted} />
        </Pressable>
      </Field>

      <Field
        label={CARD_FORM_COPY.publicNote}
        counter={CARD_FORM_COPY.counter(value.publicNote.length, PUBLIC_NOTE_MAX)}
        error={errors.publicNote}
      >
        <TextInput
          value={value.publicNote}
          onChangeText={(publicNote) => onChange({ publicNote })}
          placeholder={CARD_FORM_COPY.publicNotePlaceholder}
          placeholderTextColor={palette.textDisabled}
          maxLength={PUBLIC_NOTE_MAX}
          multiline
          editable={!disabled}
          accessibilityLabel={CARD_FORM_COPY.publicNote}
          testID="card-note"
          style={[...inputStyle, styles.note]}
        />
      </Field>

      <CardPhotos {...photos} disabled={disabled || photos.disabled} />

      <BottomSheet
        visible={choosingBinder}
        onClose={() => setChoosingBinder(false)}
        title={CARD_FORM_COPY.binder}
        testID="card-binder-sheet"
      >
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {[{ id: null, name: CARD_FORM_COPY.noBinder }, ...binders].map((binder) => {
            const on = binder.id === value.binderId;
            return (
              <Pressable
                key={binder.id ?? 'none'}
                accessibilityRole="radio"
                accessibilityLabel={binder.name}
                aria-checked={on}
                onPress={() => {
                  setChoosingBinder(false);
                  onChange({ binderId: binder.id });
                }}
                testID={`card-binder-option-${binder.id ?? 'none'}`}
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              >
                <Text style={[textStyle('md'), styles.grow, { color: palette.ink }]}>
                  {binder.name}
                </Text>
                {on ? (
                  <MaterialCommunityIcons name="check" size={20} color={palette.primary} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

function Field({
  label,
  counter,
  error,
  style,
  children,
}: {
  label: string;
  counter?: string;
  error?: string;
  style?: object;
  children: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View style={[styles.field, style]}>
      <View style={styles.labelRow}>
        <Text style={[textStyle('sm'), styles.label, styles.grow, { color: palette.ink }]}>
          {label}
        </Text>
        {counter ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{counter}</Text>
        ) : null}
      </View>
      {children}
      {error ? (
        <Text accessibilityRole="alert" style={[textStyle('xs'), { color: palette.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
  testID,
}: {
  icon: 'minus' | 'plus';
  label: string;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      testID={testID}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: palette.surfaceVariant },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={palette.ink} />
    </Pressable>
  );
}

function VisibilityToggle({
  value,
  onChange,
  disabled,
}: {
  value: CardVisibility;
  onChange: (value: CardVisibility) => void;
  disabled: boolean;
}) {
  const { palette } = useTheme();
  const options: { value: CardVisibility; label: string }[] = [
    { value: 'PRIVATE', label: CARD_FORM_COPY.private },
    { value: 'PUBLIC', label: CARD_FORM_COPY.public },
  ];
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={CARD_FORM_COPY.whoCanSee}
      style={[styles.toggle, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            aria-checked={on}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            testID={`card-visibility-${option.value}`}
            style={({ pressed }) => [
              styles.toggleOption,
              on && { backgroundColor: palette.ink },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.toggleLabel,
                {
                  color: on ? palette.background : palette.ink,
                  fontWeight: on ? fontWeight.semibold : fontWeight.medium,
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  pair: { flexDirection: 'row', gap: spacing[3] },
  stacked: { flexDirection: 'column' },
  half: { flex: 1 },
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  label: { fontWeight: fontWeight.semibold },
  grow: { flex: 1 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: spacing[2],
  },
  note: { minHeight: 64, paddingTop: 10, textAlignVertical: 'top' },
  stepper: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  step: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    flex: 1,
    minWidth: 40,
    textAlign: 'center',
    fontWeight: fontWeight.semibold,
    paddingVertical: 0,
  },
  select: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  toggle: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleOption: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: { fontSize: 15, lineHeight: 20 },
  list: { flexGrow: 0 },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
});
