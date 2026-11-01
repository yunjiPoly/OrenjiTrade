import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { PillButton } from '@/src/components/ui/PillButton';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, spacing, textStyle, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { leaveWarning, SCAN_COPY, unconfirmedWarning } from './scanCopy';
import type { ScanCounts } from './scanSession';

export interface LeaveScanSheetProps {
  visible: boolean;
  counts: ScanCounts;
  /**
   * The copies of an add sent without an answer: they may be in the inventory already, so they are
   * not counted as cards that won't be added, and the question says to check Inventory.
   */
  sent?: number;
  onStay: () => void;
  onLeave: () => void;
}

/**
 * Closing the scanner with cards in the tray asks first (mockup screen 27): "Leave without
 * adding?", "The {n} cards in this scan won't be added to your inventory.", "Keep scanning" (the
 * main button) and "Leave" (red). The cards of an add sent without an answer are not counted
 * there: "We couldn't tell whether the {n} cards you added went through: check Inventory."
 */
export function LeaveScanSheet({
  visible,
  counts,
  sent = 0,
  onStay,
  onLeave,
}: LeaveScanSheetProps) {
  const { palette } = useTheme();
  const notAdded = Math.max(0, counts.cards - sent);
  return (
    <BottomSheet visible={visible} onClose={onStay} testID="scan-leave-sheet">
      <View style={styles.body} accessibilityLabel={SCAN_COPY.leaveDialog}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[textStyle('lg'), styles.title, { color: palette.ink }]}
        >
          {SCAN_COPY.leaveTitle}
        </Text>
        {notAdded > 0 ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="scan-leave-text">
            {leaveWarning({ ...counts, cards: notAdded })}
          </Text>
        ) : null}
        {sent > 0 ? (
          <Text
            style={[textStyle('sm'), { color: palette.textMuted }]}
            testID="scan-leave-unconfirmed"
          >
            {unconfirmedWarning(sent)}
          </Text>
        ) : null}
        <PillButton
          label={SCAN_COPY.keepScanning}
          onPress={onStay}
          style={styles.stay}
          testID="scan-leave-stay"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SCAN_COPY.leave}
          onPress={onLeave}
          style={({ pressed }) => [styles.leave, pressed && styles.pressed]}
          testID="scan-leave-confirm"
        >
          <Text style={[textStyle('md'), styles.leaveLabel, { color: palette.danger }]}>
            {SCAN_COPY.leave}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[2] },
  title: { fontWeight: fontWeight.bold, marginTop: spacing[1] },
  stay: { marginTop: spacing[2] },
  leave: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  leaveLabel: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.7 },
});
