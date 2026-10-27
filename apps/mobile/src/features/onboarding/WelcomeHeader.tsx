import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { fontWeight, PINNED_MAX_FONT_SCALE, radius, spacing, useTheme } from '@/src/theme';

import { WELCOME_COPY } from './welcomeCopy';

export interface WelcomeHeaderProps {
  /** 1, 2 or 3. */
  current: number;
  total: number;
  /** Back to the step before (steps 2 and 3); step 1 shows "Welcome to OrenjiTrade" instead. */
  onBack?: () => void;
  /** What a screen reader says for Back ("Back to Who are you?"). */
  backLabel?: string;
}

/**
 * The top of a welcome step (mockup v50 screens 40 to 42): "Welcome to OrenjiTrade" or a back
 * button, "Step {n} of 3" and a three-part bar. It stays on screen above the step, so it follows
 * the text size a little only (PINNED_MAX_FONT_SCALE).
 */
export function WelcomeHeader({ current, total, onBack, backLabel }: WelcomeHeaderProps) {
  const { palette } = useTheme();
  const stepLabel = WELCOME_COPY.step(current, total);
  return (
    <View style={styles.root}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel ?? WELCOME_COPY.back}
            onPress={onBack}
            testID="welcome-back"
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="chevron-left" size={28} color={palette.ink} />
          </Pressable>
        ) : (
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.eyebrow, { color: palette.primary }]}
          >
            {WELCOME_COPY.eyebrow.toUpperCase()}
          </Text>
        )}
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[styles.step, { color: palette.textMuted }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {stepLabel}
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={stepLabel}
        // iOS reads now / (max - min) as a percentage: from 0, the steps read 33, 67 and 100 %
        // (from 1 they read 50, 100 and 150 %; stage R12's review fix 1).
        accessibilityValue={{ min: 0, max: total, now: current }}
        style={styles.bars}
        testID="onboarding-steps"
      >
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              { backgroundColor: index < current ? palette.primary : palette.surfaceVariant },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, paddingHorizontal: spacing[5], paddingTop: 14, paddingBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    gap: spacing[2],
  },
  back: {
    width: 44,
    height: 44,
    marginLeft: -12,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { flexShrink: 1, fontSize: 12, fontWeight: fontWeight.semibold, letterSpacing: 0.6 },
  step: { fontSize: 13 },
  bars: { flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: radius.pill },
  pressed: { opacity: 0.7 },
});
