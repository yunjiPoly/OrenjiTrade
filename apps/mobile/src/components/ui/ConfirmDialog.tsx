import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { HANDLE_TEXT_PROPS } from '@/src/components/ui/HandleText';
import { Text } from '@/src/components/ui/Text';
import {
  PINNED_MAX_FONT_SCALE,
  elevation,
  fontWeight,
  radius,
  spacing,
  textStyle,
  useStackedRows,
  useTheme,
} from '@/src/theme';

import { Button } from './Button';
import { useModalOnScreen, useModalTurn } from './modalTurns';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  /**
   * The title names a collector by handle ("Block {handle}?"): one line, capped, its end cut
   * with "…" where the dialog is too narrow (`HANDLE_TEXT_PROPS`), so the handle never breaks (owner decision of 2026-10-28).
   */
  handleInTitle?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
}

/**
 * A modal confirmation (works on web too, where React Native's `Alert` is a no-op). The backdrop
 * and the system back button cancel. The title and the message scroll inside the window and the
 * buttons stay under them: at the largest text sizes the message (a paragraph, uncapped) made the
 * dialog taller than the screen and its buttons out of reach. The buttons follow the text size as
 * little as other pinned controls (`PINNED_MAX_FONT_SCALE`) and, at large sizes, stack (the
 * confirmation on top) instead of sitting side by side, where "Cancel" ran out of the dialog.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  handleInTitle = false,
  onConfirm,
  onCancel,
  testID = 'confirm-dialog',
}: ConfirmDialogProps) {
  const { palette } = useTheme();
  const { height } = useWindowDimensions();
  const stacked = useStackedRows();
  // iOS: asked for from a sheet row, the dialog waits until the sheet has left (modalTurns.tsx).
  const present = useModalTurn(visible);
  useModalOnScreen(present);
  if (!present) {
    return null;
  }
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={onCancel}
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }]}
          testID={`${testID}-backdrop`}
        />
        <View
          testID={testID}
          accessibilityRole="alert"
          aria-modal
          style={[
            styles.dialog,
            elevation.menu,
            { backgroundColor: palette.surface, maxHeight: height - DIALOG_MARGIN * 2 },
          ]}
        >
          <ScrollView
            testID={`${testID}-scroll`}
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            alwaysBounceVertical={false}
          >
            <Text
              accessibilityRole="header"
              {...(handleInTitle ? HANDLE_TEXT_PROPS : {})}
              style={[textStyle('lg', 'heading'), styles.title, { color: palette.ink }]}
            >
              {title}
            </Text>
            <Text style={[textStyle('md'), { color: palette.textMuted }]}>{message}</Text>
          </ScrollView>
          <View
            testID={`${testID}-actions`}
            style={[styles.actions, stacked && styles.actionsStacked]}
          >
            <Button
              label={cancelLabel}
              variant="ghost"
              onPress={onCancel}
              disabled={busy}
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              testID={`${testID}-cancel`}
            />
            <Button
              label={confirmLabel}
              variant={tone === 'danger' ? 'danger' : 'primary'}
              onPress={onConfirm}
              loading={busy}
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              testID={`${testID}-confirm`}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** The room the dialog keeps above and below it (the root's padding and the status bar). */
const DIALOG_MARGIN = spacing[6] + spacing[12];

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[6] },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    padding: spacing[5],
    gap: spacing[3],
  },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { gap: spacing[3] },
  title: { fontWeight: fontWeight.semibold },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  // The confirmation on top, each button the dialog's width; Cancel stays first for VoiceOver.
  actionsStacked: { flexDirection: 'column-reverse', alignItems: 'stretch' },
});
