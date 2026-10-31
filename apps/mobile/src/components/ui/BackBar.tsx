import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { fontWeight, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

export interface BackBarProps {
  /** The words after the chevron: where back leads ("Inventory"), or the screen's title. */
  label: string;
  /** `back`: a muted "‹ Inventory"; `title`: "‹ Edit card" in the ink colour (mockup v32). */
  variant?: 'back' | 'title';
  /** What a screen reader says for the button ("Back to Inventory"). */
  backLabel: string;
  onBack: () => void;
  testID?: string;
}

/**
 * The top row of the screens that draw their own header (mockup v32: Add cards, Choose the
 * printing, Add to inventory, Edit card): a 44 pt back button and a label.
 */
export function BackBar({ label, variant = 'title', backLabel, onBack, testID }: BackBarProps) {
  const { palette } = useTheme();
  const title = variant === 'title';
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={onBack}
        testID={testID ?? 'back-bar'}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color={palette.ink} />
      </Pressable>
      <Text
        accessibilityRole={title ? 'header' : undefined}
        maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
        numberOfLines={1}
        style={[
          title ? styles.title : styles.muted,
          { color: title ? palette.ink : palette.textMuted },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -8 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: fontWeight.semibold },
  muted: { flex: 1, fontSize: 15, lineHeight: 20 },
  pressed: { opacity: 0.7 },
});
