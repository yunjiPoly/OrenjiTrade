import { StyleSheet, Text, View } from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface StepIndicatorProps {
  steps: readonly string[];
  current: number;
}

/** "Step 2 of 3 · Interests" with a segmented progress bar. */
export function StepIndicator({ steps, current }: StepIndicatorProps) {
  const { palette } = useTheme();
  const label = `Step ${current + 1} of ${steps.length} · ${steps[current] ?? ''}`;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 1, max: steps.length, now: current + 1 }}
      style={styles.root}
      testID="onboarding-steps"
    >
      <Text style={[textStyle('sm'), styles.label, { color: palette.textMuted }]}>{label}</Text>
      <View style={styles.bars}>
        {steps.map((step, index) => (
          <View
            key={step}
            style={[
              styles.bar,
              { backgroundColor: index <= current ? palette.primary : palette.border },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2], marginBottom: spacing[5] },
  label: { fontWeight: fontWeight.medium },
  bars: { flexDirection: 'row', gap: spacing[1] },
  bar: { flex: 1, height: 4, borderRadius: radius.pill },
});
