import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { TextField } from '@/src/components/ui/TextField';
import { elevation, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { OFFER_REASON_MAX } from './offerLabels';

export interface ReasonDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Label of the reason field ("Reason (optional)", "Why are you cancelling?"). */
  label: string;
  /** A reason is needed to confirm (trade cancellation). */
  required?: boolean;
  placeholder?: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  testID?: string;
}

/**
 * A confirmation with a reason (web: `OfferReasonDialogComponent`): decline or withdraw an offer
 * (optional reason) and cancel a trade (required). The reason is shown to the other party and
 * limited to 500 characters; the backdrop and the system back button cancel.
 */
export function ReasonDialog({
  visible,
  title,
  message,
  confirmLabel,
  label,
  required = false,
  placeholder,
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
  testID = 'reason-dialog',
}: ReasonDialogProps) {
  const { palette } = useTheme();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  // Every opening starts empty (state adjusted while rendering, not in an effect).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setReason('');
      setTouched(false);
    }
  }

  if (!visible) {
    return null;
  }
  const trimmed = reason.trim();
  const error =
    reason.length > OFFER_REASON_MAX
      ? `Keep the reason under ${OFFER_REASON_MAX} characters.`
      : required && touched && !trimmed
        ? 'Give a short reason.'
        : null;

  const confirm = () => {
    setTouched(true);
    if ((required && !trimmed) || reason.length > OFFER_REASON_MAX) {
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
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
          <TextField
            label={label}
            value={reason}
            onChangeText={setReason}
            placeholder={placeholder}
            multiline
            maxLength={OFFER_REASON_MAX + 50}
            error={error}
            hint={`${reason.length} / ${OFFER_REASON_MAX}`}
            testID={`${testID}-reason`}
          />
          <View style={styles.actions}>
            <Button
              label="Back"
              variant="ghost"
              onPress={onCancel}
              disabled={busy}
              testID={`${testID}-cancel`}
            />
            <Button
              label={confirmLabel}
              variant={tone === 'danger' ? 'danger' : 'primary'}
              onPress={confirm}
              loading={busy}
              testID={`${testID}-confirm`}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
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
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[2],
  },
});
