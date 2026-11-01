import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { BinderResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Text, TextInput } from '@/src/components/ui/Text';
import { fontWeight, PINNED_MAX_FONT_SCALE, spacing, textStyle, useTheme } from '@/src/theme';

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
import { PriceField } from './PriceField';
import { cardVisibilityHint, type CardFindability, type SavedCardState } from './visibilityStatus';

export interface CardFormFieldsProps {
  value: CardFormValue;
  onChange: (patch: Partial<CardFormValue>) => void;
  errors: CardFormErrors;
  binders: readonly BinderResponse[];
  /**
   * What decides whether collectors can find a public card (the region, "Show me on the map", the
   * profile, a pause): the Public hint says they can only when they really can.
   */
  findability: CardFindability;
  /**
   * Edit card: the card as saved and whether a change is pending, for the hint (hidden until
   * confirmed, a temporary publication that ended). None while adding.
   */
  saved?: SavedCardState | null;
  photos: CardPhotosProps;
  disabled?: boolean;
}

/**
 * The fields of Add to inventory and Edit card, in the order of the spec (section 6, screen 6):
 * Copies on its own row (the label on the left, − n + on the right) above the Asking price in "$"
 * or "% TCG" (owner change of 2026-10-16, mockup v43), Who can see it, Binder, Public note, Photos.
 */
export function CardFormFields({
  value,
  onChange,
  errors,
  binders,
  findability,
  saved = null,
  photos,
  disabled = false,
}: CardFormFieldsProps) {
  const { palette } = useTheme();
  const [choosingBinder, setChoosingBinder] = useState(false);
  const chosenBinder = value.binderId
    ? (binders.find((binder) => binder.id === value.binderId) ?? null)
    : null;
  const binderName = chosenBinder?.name ?? CARD_FORM_COPY.noBinder;
  const hint = cardVisibilityHint(value.visibility, findability, chosenBinder, saved);
  const quantity = parseQuantity(value.quantity);
  const inputStyle = [
    textStyle('md'),
    styles.input,
    { color: palette.ink, backgroundColor: palette.surface, borderColor: palette.borderStrong },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.field}>
        <View
          testID="card-copies"
          style={[
            styles.copies,
            {
              backgroundColor: palette.surface,
              borderColor: errors.quantity ? palette.danger : palette.borderStrong,
            },
          ]}
        >
          <Text style={[styles.copiesLabel, { color: palette.ink }]}>{CARD_FORM_COPY.copies}</Text>
          <View style={styles.stepper}>
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
              // No line height: iOS puts the extra of a line height above a one-line field.
              style={[styles.count, { color: palette.ink }]}
            />
            <StepButton
              icon="plus"
              label={CARD_FORM_COPY.oneMore}
              disabled={disabled || !(quantity < QUANTITY_MAX)}
              onPress={() => onChange({ quantity: stepQuantity(value.quantity, 1) })}
              testID="card-quantity-more"
            />
          </View>
        </View>
        {errors.quantity ? (
          <Text accessibilityRole="alert" style={[textStyle('xs'), { color: palette.danger }]}>
            {errors.quantity}
          </Text>
        ) : null}
      </View>

      <PriceField value={value} onChange={onChange} error={errors.price} disabled={disabled} />

      <View style={styles.field}>
        <Text style={[textStyle('sm'), styles.label, { color: palette.ink }]}>
          {CARD_FORM_COPY.whoCanSee}
        </Text>
        <VisibilityToggle
          value={value.visibility}
          onChange={(visibility) => onChange({ visibility })}
          disabled={disabled}
        />
        <View style={styles.hintRow}>
          {hint.findable ? null : (
            <MaterialCommunityIcons
              name="eye-off-outline"
              size={16}
              color={palette.status.stale}
              style={styles.hintIcon}
            />
          )}
          <Text
            testID="card-visibility-hint"
            style={[
              textStyle('xs'),
              styles.grow,
              { color: hint.findable ? palette.textMuted : palette.ink },
            ]}
          >
            {hint.text}
          </Text>
        </View>
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
            const isPrivate = 'visibility' in binder && binder.visibility === 'PRIVATE';
            return (
              <Pressable
                key={binder.id ?? 'none'}
                accessibilityRole="radio"
                accessibilityLabel={
                  isPrivate ? CARD_FORM_COPY.privateBinderLabel(binder.name) : binder.name
                }
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
                {isPrivate ? (
                  <View
                    testID={`card-binder-private-${binder.id}`}
                    style={[styles.privateTag, { backgroundColor: palette.surfaceVariant }]}
                  >
                    <MaterialCommunityIcons
                      name="lock-outline"
                      size={13}
                      color={palette.textMuted}
                    />
                    <Text style={[styles.privateTagLabel, { color: palette.textMuted }]}>
                      {CARD_FORM_COPY.privateBinder}
                    </Text>
                  </View>
                ) : null}
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

/**
 * "Who can see it": Private | Public (the card form, and Edit binder of stage R3 with its own
 * test ids).
 */
export function VisibilityToggle({
  value,
  onChange,
  disabled,
  testIDPrefix = 'card-visibility',
}: {
  value: CardVisibility;
  onChange: (value: CardVisibility) => void;
  disabled: boolean;
  testIDPrefix?: string;
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
            testID={`${testIDPrefix}-${option.value}`}
            style={({ pressed }) => [
              styles.toggleOption,
              on && { backgroundColor: palette.ink },
              pressed && styles.pressed,
            ]}
          >
            <Text
              // Two words side by side: past this size "Private" broke in the middle.
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
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
  copies: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: spacing[2],
    paddingLeft: 14,
    paddingRight: 5,
    paddingVertical: 5,
  },
  copiesLabel: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    minWidth: 32,
    textAlign: 'center',
    fontSize: 16,
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
  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  hintIcon: { marginTop: 1 },
  privateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  privateTagLabel: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
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
