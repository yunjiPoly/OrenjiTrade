import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/src/theme';

import { SCAN_COPY } from './scanCopy';

export interface ScanGateFrameProps {
  onClose: () => void;
  children: ReactNode;
  testID: string;
}

/**
 * The page the scan's route shows before the camera can open: while it checks whether scanning
 * is on, when the check failed (with "Try again"), and when scanning is not available (this build
 * has no reader: Expo Go, the web; or the flag `cardTextScan` is off). Its Close leads back.
 */
export function ScanGateFrame({ onClose, children, testID }: ScanGateFrameProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: palette.background,
          paddingTop: insets.top + 4,
          paddingBottom: insets.bottom + 16,
        },
      ]}
      testID={testID}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={SCAN_COPY.close}
        onPress={onClose}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        testID="scan-gate-close"
      >
        <MaterialCommunityIcons name="chevron-left" size={26} color={palette.ink} />
      </Pressable>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 8 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  pressed: { opacity: 0.7 },
});
