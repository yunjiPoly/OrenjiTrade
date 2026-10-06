import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { TextField, type TextFieldProps } from './TextField';

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Rich label content (links); `label` stays the accessible name. */
  children?: ReactNode;
  error?: boolean;
  disabled?: boolean;
  testID?: string;
}

/** A labelled checkbox; the whole row toggles it. */
export function Checkbox({
  label,
  checked,
  onChange,
  children,
  error,
  disabled,
  testID,
}: CheckboxProps) {
  const { palette } = useTheme();
  const color = error ? palette.danger : checked ? palette.primary : palette.borderStrong;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [
        styles.checkRow,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View
        style={[
          styles.box,
          { borderColor: color, backgroundColor: checked ? palette.primary : 'transparent' },
        ]}
      >
        {checked ? (
          <MaterialCommunityIcons name="check" size={16} color={palette.onPrimary} />
        ) : null}
      </View>
      <View style={styles.grow}>
        {children ?? <Text style={[textStyle('sm'), { color: palette.ink }]}>{label}</Text>}
      </View>
    </Pressable>
  );
}

export interface SwitchRowProps {
  label: string;
  help?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * A setting with a switch. The row is the accessible control (`role=switch`, its label as name,
 * the help text as hint); the visual switch is decorative so screen readers announce it once.
 */
export function SwitchRow({ label, help, value, onChange, disabled, testID }: SwitchRowProps) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={help}
      aria-checked={value}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.switchRow,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.grow}>
        <Text style={[textStyle('md'), styles.rowLabel, { color: palette.ink }]}>{label}</Text>
        {help ? <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{help}</Text> : null}
      </View>
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Switch
          value={value}
          disabled={disabled}
          trackColor={{ true: palette.primary, false: palette.borderStrong }}
          thumbColor={palette.surface}
        />
      </View>
    </Pressable>
  );
}

export interface RadioOption<T extends string> {
  value: T;
  label: string;
  help?: string;
}

export interface RadioGroupProps<T extends string> {
  label: string;
  options: readonly RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Group id; each option is `<testID>-<value>`. */
  testID?: string;
}

export function RadioGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  testID,
}: RadioGroupProps<T>) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={styles.radioGroup}
      testID={testID}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityHint={option.help}
            aria-checked={selected}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={({ pressed }) => [styles.radioRow, pressed && styles.pressed]}
          >
            <View
              style={[
                styles.radio,
                { borderColor: selected ? palette.primary : palette.borderStrong },
              ]}
            >
              {selected ? (
                <View style={[styles.radioDot, { backgroundColor: palette.primary }]} />
              ) : null}
            </View>
            <View style={styles.grow}>
              <Text style={[textStyle('md'), styles.rowLabel, { color: palette.ink }]}>
                {option.label}
              </Text>
              {option.help ? (
                <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{option.help}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A password input with a show/hide toggle. */
export function PasswordField(props: Omit<TextFieldProps, 'secureTextEntry'>) {
  const { palette } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <TextField {...props} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onPress={() => setVisible((current) => !current)}
        hitSlop={8}
        style={styles.eye}
        testID={props.testID ? `${props.testID}-toggle` : undefined}
      >
        <MaterialCommunityIcons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={palette.textMuted}
        />
      </Pressable>
    </View>
  );
}

export type FormMessageTone = 'error' | 'info' | 'success';

export interface FormMessageProps {
  tone?: FormMessageTone;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Inline alert above or below a form (role alert for errors, status otherwise). */
export function FormMessage({ tone = 'error', children, style, testID }: FormMessageProps) {
  const { palette } = useTheme();
  const color =
    tone === 'error' ? palette.danger : tone === 'success' ? palette.success : palette.info;
  const icon =
    tone === 'error'
      ? 'alert-circle-outline'
      : tone === 'success'
        ? 'check-circle-outline'
        : 'information-outline';
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      style={[
        styles.message,
        { borderColor: color, backgroundColor: palette.surfaceVariant },
        style,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={color} />
      <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 44 },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 48,
    paddingVertical: spacing[2],
  },
  rowLabel: { fontWeight: fontWeight.medium },
  radioGroup: { gap: spacing[1] },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingVertical: spacing[2],
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  eye: { position: 'absolute', right: spacing[3], top: 36 },
  message: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
