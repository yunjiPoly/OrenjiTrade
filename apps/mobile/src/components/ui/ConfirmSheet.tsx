import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { fontWeight, lightPalette, spacing, textStyle, useTheme } from '@/src/theme';

import { BottomSheet } from './BottomSheet';

export interface ConfirmSheetProps {
  visible: boolean;
  /** "Delete Ash Blossom & Joyous Spring?" */
  title: string;
  message: string;
  /** The red button ("Delete"). */
  confirmLabel: string;
  /** The way out ("Keep it"). */
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** The sheet; its buttons are `<testID>-confirm` and `<testID>-cancel`. */
  testID?: string;
}

/**
 * A destructive confirmation in a bottom sheet (owner spec 2026-10-14, section 3: "bottom sheets
 * for … confirmations (destructive buttons red)"): the question, what happens, a red button and a
 * way out. The red is the same in both schemes (white on it reads at 4.8 : 1).
 */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
  testID = 'confirm-sheet',
}: ConfirmSheetProps) {
  const { palette } = useTheme();
  return (
    <BottomSheet visible={visible} onClose={busy ? () => undefined : onCancel} testID={testID}>
      <View style={styles.body}>
        <Text
          accessibilityRole="header"
          style={[textStyle('lg'), styles.title, { color: palette.ink }]}
        >
          {title}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{message}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={confirmLabel}
        aria-busy={busy}
        disabled={busy}
        onPress={onConfirm}
        testID={`${testID}-confirm`}
        style={({ pressed }) => [
          styles.button,
          styles.danger,
          { backgroundColor: lightPalette.danger },
          pressed && styles.pressed,
        ]}
      >
        {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
        <Text style={[textStyle('md'), styles.dangerLabel]}>{confirmLabel}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
        disabled={busy}
        onPress={onCancel}
        testID={`${testID}-cancel`}
        style={({ pressed }) => [
          styles.button,
          styles.cancel,
          { borderColor: palette.borderStrong },
          pressed && styles.pressed,
          busy && styles.disabled,
        ]}
      >
        <Text style={[textStyle('md'), styles.cancelLabel, { color: palette.ink }]}>
          {cancelLabel}
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[2], paddingTop: spacing[2] },
  title: { fontWeight: fontWeight.bold },
  button: {
    minHeight: 48,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
  },
  danger: { minHeight: 52, marginTop: spacing[2] },
  dangerLabel: { color: '#FFFFFF', fontWeight: fontWeight.bold },
  cancel: { borderWidth: 1 },
  cancelLabel: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
