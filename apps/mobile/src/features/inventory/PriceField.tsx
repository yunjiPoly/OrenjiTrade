import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text, TextInput } from '@/src/components/ui/Text';
import { fontWeight, PINNED_MAX_FONT_SCALE, spacing, textStyle, useTheme } from '@/src/theme';

import { switchPriceMode, typePrice, type CardFormValue } from './cardForm';
import { CARD_FORM_COPY } from './inventoryCopy';
import type { PriceMode } from './itemPrice';

export interface PriceFieldProps {
  value: Pick<CardFormValue, 'priceMode' | 'price' | 'priceWas'>;
  onChange: (patch: Partial<CardFormValue>) => void;
  error?: string;
  disabled?: boolean;
}

const MODES: readonly PriceMode[] = ['usd', 'pct'];

/** Long enough for the field to get "no keyboard" before it gets its keyboard back. */
const KEYBOARD_RELOAD_MS = 50;

/**
 * "Asking price" of Add to inventory and Edit card (owner change of 2026-10-16, mockup v43, screens
 * 6 and 7): the switch "$" | "% TCG" beside a number box. "$" puts a "$" before the number, opens
 * the decimal keyboard and suggests 12.50; "% TCG" puts "% TCG" after it, opens the number pad and
 * suggests 85. Switching clears the number (85% is not $85) and keeps the keyboard open. Under the
 * box: the error, a saved text neither mode shows ("Was: Trade only", kept until a price is typed),
 * and the hint of the mode. At large text sizes the switch sits above the box.
 */
export function PriceField({ value, onChange, error, disabled = false }: PriceFieldProps) {
  const { palette } = useTheme();
  const stacked = useWindowDimensions().fontScale > 1.3;
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const mode = value.priceMode;
  // iOS keeps the keyboard it showed when a focused field changes its keyboard type, until the
  // keyboard is reloaded: turning `showSoftInputOnFocus` off and, once that reached the field, on
  // again reloads it (React Native reloads the keyboard when that prop comes back on), so the
  // switch changes the keys without closing the keyboard.
  const [reloadKeyboard, setReloadKeyboard] = useState(false);
  useEffect(() => {
    if (!reloadKeyboard) {
      return undefined;
    }
    const timer = setTimeout(() => setReloadKeyboard(false), KEYBOARD_RELOAD_MS);
    return () => clearTimeout(timer);
  }, [reloadKeyboard]);

  const choose = (next: PriceMode) => {
    if (next === mode) {
      return;
    }
    if (Platform.OS === 'ios' && input.current?.isFocused()) {
      setReloadKeyboard(true);
    }
    onChange(switchPriceMode(value, next));
  };

  return (
    <View style={styles.field}>
      <Text style={[textStyle('sm'), styles.label, { color: palette.ink }]}>
        {CARD_FORM_COPY.askingPrice}
      </Text>
      <View style={[styles.row, stacked && styles.stacked]}>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={CARD_FORM_COPY.priceIn}
          style={[styles.switch, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          {MODES.map((option) => {
            const on = option === mode;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={CARD_FORM_COPY.priceModes[option].spoken}
                aria-checked={on}
                disabled={disabled}
                onPress={() => choose(option)}
                testID={`card-price-mode-${option}`}
                style={({ pressed }) => [
                  styles.option,
                  option === 'usd' ? styles.optionUsd : styles.optionPct,
                  on && { backgroundColor: palette.ink },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  // Short labels side by side: they grow no more than the other pinned controls.
                  maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                  style={[
                    option === 'usd' ? styles.optionLabelUsd : styles.optionLabelPct,
                    { color: on ? palette.background : palette.ink },
                  ]}
                >
                  {CARD_FORM_COPY.priceModes[option].label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          // The box focuses its field anywhere it is touched, the "$" and "% TCG" included.
          accessible={false}
          disabled={disabled}
          onPress={() => input.current?.focus()}
          testID="card-price-box"
          style={[
            styles.box,
            stacked ? styles.boxStacked : styles.boxBeside,
            {
              backgroundColor: palette.surface,
              borderColor: error ? palette.danger : palette.borderStrong,
            },
          ]}
        >
          {mode === 'usd' ? (
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={[styles.prefix, { color: palette.textMuted }]}
            >
              $
            </Text>
          ) : null}
          <TextInput
            ref={input}
            value={value.price}
            onChangeText={(text) => onChange(typePrice(value, text))}
            placeholder={CARD_FORM_COPY.pricePlaceholder[mode]}
            placeholderTextColor={palette.textDisabled}
            keyboardType={mode === 'usd' ? 'decimal-pad' : 'number-pad'}
            showSoftInputOnFocus={Platform.OS === 'ios' ? !reloadKeyboard : undefined}
            maxLength={mode === 'usd' ? 12 : 4}
            autoCorrect={false}
            editable={!disabled}
            accessibilityLabel={CARD_FORM_COPY.priceInputLabel[mode]}
            accessibilityHint={CARD_FORM_COPY.priceHint[mode]}
            testID="card-price"
            // No line height: iOS puts the extra of a line height above a one-line field.
            style={[styles.input, { color: palette.ink }]}
          />
          {mode === 'pct' ? (
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={[styles.suffix, { color: palette.textMuted }]}
            >
              {CARD_FORM_COPY.priceModes.pct.label}
            </Text>
          ) : null}
        </Pressable>
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          testID="card-price-error"
          style={[textStyle('xs'), { color: palette.danger }]}
        >
          {error}
        </Text>
      ) : null}
      {value.priceWas !== null ? (
        <Text testID="card-price-was" style={[textStyle('xs'), { color: palette.ink }]}>
          {CARD_FORM_COPY.priceWas(value.priceWas)}
        </Text>
      ) : null}
      <Text testID="card-price-hint" style={[textStyle('xs'), { color: palette.textMuted }]}>
        {CARD_FORM_COPY.priceHint[mode]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontWeight: fontWeight.semibold },
  row: { flexDirection: 'row', gap: spacing[2] },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  switch: {
    flexDirection: 'row',
    gap: 2,
    padding: 4,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
  },
  option: {
    minHeight: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  optionUsd: { minWidth: 44 },
  optionPct: { minWidth: 68 },
  optionLabelUsd: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.bold },
  optionLabelPct: { fontSize: 14, lineHeight: 18, fontWeight: fontWeight.bold },
  box: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
  },
  boxBeside: { flex: 1, minWidth: 0 },
  boxStacked: { alignSelf: 'stretch' },
  prefix: { fontSize: 16, fontWeight: fontWeight.semibold },
  suffix: { fontSize: 15, fontWeight: fontWeight.semibold },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    paddingVertical: spacing[2],
    paddingHorizontal: 0,
  },
  pressed: { opacity: 0.8 },
});
