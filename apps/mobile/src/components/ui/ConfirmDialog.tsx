import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { elevation, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { Button } from './Button';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
}

/**
 * A modal confirmation (works on web too, where React Native's `Alert` is a no-op). The backdrop
 * and the system back button cancel.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
  testID = 'confirm-dialog',
}: ConfirmDialogProps) {
  const { palette } = useTheme();
  if (!visible) {
    return null;
  }
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={onCancel}
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.overlay }]}
        />
        <View
          testID={testID}
          accessibilityRole="alert"
          aria-modal
          style={[styles.dialog, elevation.menu, { backgroundColor: palette.surface }]}
        >
          <Text
            accessibilityRole="header"
            style={[textStyle('lg', 'heading'), styles.title, { color: palette.ink }]}
          >
            {title}
          </Text>
          <Text style={[textStyle('md'), { color: palette.textMuted }]}>{message}</Text>
          <View style={styles.actions}>
            <Button
              label={cancelLabel}
              variant="ghost"
              onPress={onCancel}
              disabled={busy}
              testID={`${testID}-cancel`}
            />
            <Button
              label={confirmLabel}
              variant={tone === 'danger' ? 'danger' : 'primary'}
              onPress={onConfirm}
              loading={busy}
              testID={`${testID}-confirm`}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[6] },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    padding: spacing[5],
    gap: spacing[3],
  },
  title: { fontWeight: fontWeight.semibold },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[2],
    marginTop: spacing[2],
  },
});
