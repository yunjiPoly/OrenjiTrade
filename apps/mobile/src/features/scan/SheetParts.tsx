import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { fontWeight, PINNED_MAX_FONT_SCALE, spacing, textStyle, useTheme } from '@/src/theme';

import { SCAN_COPY } from './scanCopy';

/**
 * Small parts the scan's sheets share (mockup screens 27 to 29): the outlined Cancel, and the
 * header with "Remove", the title and Close.
 */

/**
 * The last value that was not null: a sheet keeps showing its tile while it slides away after the
 * tile was let go (closed, removed or fixed).
 */
export function useLastValue<T>(value: T | null): T | null {
  const [last, setLast] = useState<T | null>(value);
  if (value !== null && value !== last) {
    setLast(value);
  }
  return value ?? last;
}

export function SheetCancel({ onPress, testID }: { onPress: () => void; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={SCAN_COPY.cancel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cancel,
        { borderColor: palette.borderStrong },
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <Text style={[textStyle('md'), styles.cancelLabel, { color: palette.ink }]}>
        {SCAN_COPY.cancel}
      </Text>
    </Pressable>
  );
}

export interface SheetHeaderProps {
  title: string;
  onRemove: () => void;
  onClose: () => void;
  testID: string;
}

/** "Remove" (red), the title in the middle, and the round Close (screens 28 and 29). */
export function SheetHeader({ title, onRemove, onClose, testID }: SheetHeaderProps) {
  const { palette } = useTheme();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={SCAN_COPY.remove}
        onPress={onRemove}
        hitSlop={4}
        style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
        testID={`${testID}-remove`}
      >
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[textStyle('md'), styles.removeLabel, { color: palette.danger }]}
        >
          {SCAN_COPY.remove}
        </Text>
      </Pressable>
      <Text
        accessibilityRole="header"
        // The header stays on top of a sheet that scrolls: it follows the text size a little.
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        style={[textStyle('md'), styles.title, { color: palette.ink }]}
      >
        {title}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={SCAN_COPY.closeSheet}
        onPress={onClose}
        style={({ pressed }) => [
          styles.close,
          { backgroundColor: palette.surfaceVariant },
          pressed && styles.pressed,
        ]}
        testID={`${testID}-close`}
      >
        <MaterialCommunityIcons name="close" size={20} color={palette.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cancel: {
    minHeight: 48,
    marginTop: spacing[2],
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  cancelLabel: { fontWeight: fontWeight.semibold },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  remove: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 4 },
  removeLabel: { fontWeight: fontWeight.semibold },
  title: { flex: 1, textAlign: 'center', fontWeight: fontWeight.bold, fontSize: 17 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
