import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { spacing, textStyle, useTheme } from '@/src/theme';

import { SHADE_LEGEND, SHADE_OPACITY } from './shading';

/**
 * Legend of the map's shading (the web's legend): five steps of public binders, lightest first,
 * and the credit of the borders. Hidden from screen readers like on the web: the map's name says
 * what the shading means and the list gives every number.
 */
export function MapLegend({
  testID = 'map-legend',
  maxFontSizeMultiplier,
}: {
  testID?: string;
  /** How far the legend follows the system text size (over the map: a little only). */
  maxFontSizeMultiplier?: number;
}) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.legend}
      testID={testID}
    >
      <Text
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        style={[textStyle('xs'), { color: palette.textMuted }]}
      >
        Public binders
      </Text>
      <View style={styles.steps}>
        {SHADE_LEGEND.map((step) => (
          <View key={step.level} style={styles.step}>
            <View
              style={[
                styles.swatch,
                { backgroundColor: palette.surface, borderColor: palette.borderStrong },
              ]}
            >
              <View
                style={[
                  styles.tint,
                  { backgroundColor: palette.primary, opacity: SHADE_OPACITY[step.level] },
                ]}
              />
            </View>
            <Text
              maxFontSizeMultiplier={maxFontSizeMultiplier}
              style={[textStyle('xs'), { color: palette.textMuted }]}
            >
              {step.label}
            </Text>
          </View>
        ))}
      </View>
      <Text
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        style={[textStyle('xs'), styles.credit, { color: palette.textMuted }]}
      >
        Made with Natural Earth
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing[3],
    rowGap: spacing[1],
  },
  steps: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing[3] },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  swatch: { width: 18, height: 12, borderRadius: 3, borderWidth: 1, overflow: 'hidden' },
  tint: { flex: 1 },
  credit: { marginLeft: 'auto' },
});
