import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useHandleAvailability } from '@/src/api/hooks/profile';
import { Text, TextInput } from '@/src/components/ui/Text';
import { HANDLE_MAX, HANDLE_PATTERN } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { WELCOME_COPY } from './welcomeCopy';
import { handleCheckState, type HandleCheck } from './welcomeSteps';

/** How long typing must pause before the handle is checked. */
export const HANDLE_CHECK_DELAY_MS = 400;

function useSettled(value: string, delayMs: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);
  return settled;
}

/**
 * The live check of the handle (stage R12): asked once typing pauses, only for a well-formed
 * handle (`GET /me/profile/handle-availability`).
 */
export function useHandleCheck(typed: string): HandleCheck {
  const normalised = typed.trim().toLowerCase();
  const settled = useSettled(normalised, HANDLE_CHECK_DELAY_MS);
  const valid = HANDLE_PATTERN.test(settled);
  const query = useHandleAvailability(settled, valid);
  return handleCheckState({
    typed,
    settled,
    fetching: query.isFetching,
    answer: query.data,
  });
}

export interface HandleFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** The save's or the form's error (wins over the live check). */
  error?: string | null;
  disabled?: boolean;
}

/**
 * The handle of the welcome (mockup v50 screen 40): "@" before it, a teal check when it is free,
 * "That handle is already taken. Try another one." when it is not, the rules under it.
 */
export function HandleField({ value, onChange, error, disabled }: HandleFieldProps) {
  const { palette, tokens } = useTheme();
  const [focused, setFocused] = useState(false);
  const check = useHandleCheck(value);
  const message = error ?? (check === 'taken' ? WELCOME_COPY.profile.handleTaken : null);
  const borderColor = message ? palette.danger : focused ? palette.focusRing : palette.borderStrong;

  return (
    <View style={styles.container}>
      <Text style={[textStyle('sm'), styles.label, { color: palette.ink }]}>
        {WELCOME_COPY.profile.handle}
      </Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: palette.surface,
            borderColor,
            borderWidth: focused || message ? tokens.focus.width : 1,
          },
        ]}
      >
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[textStyle('md'), { color: palette.textDisabled }]}
        >
          @
        </Text>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(text.toLowerCase())}
          accessibilityLabel={WELCOME_COPY.profile.handle}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          maxLength={HANDLE_MAX}
          editable={!disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          testID="profile-handle"
          style={[textStyle('md'), styles.input, { color: palette.ink }]}
        />
        {check === 'checking' ? (
          <View
            accessible
            accessibilityLabel={WELCOME_COPY.profile.handleChecking}
            testID="handle-checking"
          >
            <ActivityIndicator size="small" color={palette.textMuted} />
          </View>
        ) : check === 'available' && !message ? (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={WELCOME_COPY.profile.handleAvailable}
            testID="handle-available"
          >
            <MaterialCommunityIcons name="check" size={20} color={palette.accent} />
          </View>
        ) : null}
      </View>
      {message ? (
        <Text
          accessibilityRole="alert"
          testID="handle-error"
          style={[textStyle('xs'), { color: palette.danger }]}
        >
          {message}
        </Text>
      ) : (
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          {WELCOME_COPY.profile.handleHint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing[1] },
  label: { fontWeight: fontWeight.medium },
  field: {
    minHeight: 48,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: spacing[3],
    paddingRight: spacing[3],
  },
  input: { flex: 1, minWidth: 0, paddingVertical: spacing[2] },
});
