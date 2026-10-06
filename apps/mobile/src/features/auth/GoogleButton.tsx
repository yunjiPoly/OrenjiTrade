import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/** Google's brand blue, for the "G" mark only (never a theme token). */
const GOOGLE_BLUE = '#4285F4';

export interface GoogleButtonProps {
  label?: string;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}

/**
 * "Continue with Google" (web: `app-google-button`): an outlined button with the G mark;
 * "Opening Google…" while the flow runs.
 */
export function GoogleButton({
  label = 'Continue with Google',
  busy = false,
  disabled = false,
  onPress,
  testID = 'google-button',
}: GoogleButtonProps) {
  const { palette } = useTheme();
  const inactive = busy || disabled;
  const text = busy ? 'Opening Google…' : label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      aria-disabled={inactive}
      aria-busy={busy}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.surface, borderColor: palette.borderStrong },
        pressed && styles.pressed,
        inactive && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={palette.ink} />
      ) : (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.mark, { borderColor: palette.border }]}
        >
          <Text style={styles.markText}>G</Text>
        </View>
      )}
      <Text style={[textStyle('md'), styles.label, { color: palette.ink }]}>{text}</Text>
    </Pressable>
  );
}

/** The "or" line between the e-mail form and the Google button (web: `.form__divider`). */
export function OrDivider() {
  const { palette } = useTheme();
  return (
    <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no">
      <View style={[styles.line, { backgroundColor: palette.border }]} />
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>or</Text>
      <View style={[styles.line, { backgroundColor: palette.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 44,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  mark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  markText: { color: GOOGLE_BLUE, fontSize: 14, lineHeight: 16, fontWeight: fontWeight.bold },
  label: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
