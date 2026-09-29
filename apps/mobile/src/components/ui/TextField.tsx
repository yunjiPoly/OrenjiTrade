import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Labelled input with visible focus ring (2px accent) and inline error, per the design system. */
export function TextField({ label, error, hint, containerStyle, onFocus, onBlur, testID, ...inputProps }: TextFieldProps) {
  const { palette, tokens } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? palette.danger : focused ? palette.focusRing : palette.borderStrong;

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[textStyle('sm'), styles.label, { color: palette.ink }]}>{label}</Text>
      <TextInput
        {...inputProps}
        testID={testID}
        accessibilityLabel={label}
        placeholderTextColor={palette.textDisabled}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          textStyle('md'),
          styles.input,
          {
            color: palette.ink,
            backgroundColor: palette.surface,
            borderColor,
            borderWidth: focused || error ? tokens.focus.width : 1,
          },
        ]}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[textStyle('xs'), { color: palette.danger }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing[1] },
  label: { fontWeight: fontWeight.medium },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
  },
});
