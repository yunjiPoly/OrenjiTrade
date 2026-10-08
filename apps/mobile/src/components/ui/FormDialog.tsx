import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { elevation, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { Button } from './Button';

export interface FormDialogProps {
  visible: boolean;
  title: string;
  /** Lead sentence under the title. */
  message?: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
}

/**
 * A modal form (web: a Material dialog with a form): a title, a lead, scrollable fields above
 * the keyboard and Cancel / confirm. The backdrop and the system back button cancel unless the
 * form is being sent.
 */
export function FormDialog({
  visible,
  title,
  message,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
  testID = 'form-dialog',
}: FormDialogProps) {
  const { palette } = useTheme();
  if (!visible) {
    return null;
  }
  const cancel = () => {
    if (!busy) {
      onCancel();
    }
  };
  return (
    <Modal transparent visible animationType="fade" onRequestClose={cancel}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={cancel}
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.overlay }]}
        />
        <View
          testID={testID}
          accessibilityRole="alert"
          aria-modal
          style={[styles.dialog, elevation.menu, { backgroundColor: palette.surface }]}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            testID={`${testID}-scroll`}
          >
            <Text
              accessibilityRole="header"
              style={[textStyle('lg', 'heading'), styles.title, { color: palette.ink }]}
            >
              {title}
            </Text>
            {message ? (
              <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{message}</Text>
            ) : null}
            {children}
            <View style={styles.actions}>
              <Button
                label={cancelLabel}
                variant="ghost"
                onPress={cancel}
                disabled={busy}
                testID={`${testID}-cancel`}
              />
              <Button
                label={confirmLabel}
                onPress={onConfirm}
                loading={busy}
                testID={`${testID}-confirm`}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[4] },
  dialog: { width: '100%', maxWidth: 480, maxHeight: '92%', borderRadius: radius.lg },
  content: { padding: spacing[5], gap: spacing[3] },
  title: { fontWeight: fontWeight.semibold },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[2],
  },
});
