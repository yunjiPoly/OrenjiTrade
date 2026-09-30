import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { assertNever } from '@/src/lib/assertNever';
import { fontFamily, fontWeight, radius, spacing, useTheme, type Palette } from '@/src/theme';

/** Freshness buckets from docs/design/design-system.md. */
export type Freshness = 'FRESH' | 'AGING' | 'STALE' | 'HIDDEN';

/** Card condition vocabulary (games may narrow it through their GameSchema). */
export type CardCondition =
  'MINT' | 'NEAR_MINT' | 'LIGHTLY_PLAYED' | 'MODERATELY_PLAYED' | 'HEAVILY_PLAYED' | 'DAMAGED';

export type BadgeProps =
  | { variant: 'freshness'; value: Freshness; style?: StyleProp<ViewStyle>; testID?: string }
  | { variant: 'condition'; value: CardCondition; style?: StyleProp<ViewStyle>; testID?: string };

export const FRESHNESS_LABELS: Record<Freshness, string> = {
  FRESH: 'Fresh',
  AGING: 'Aging',
  STALE: 'Stale',
  HIDDEN: 'Hidden',
};

export const CONDITION_ABBREVIATIONS: Record<CardCondition, string> = {
  MINT: 'M',
  NEAR_MINT: 'NM',
  LIGHTLY_PLAYED: 'LP',
  MODERATELY_PLAYED: 'MP',
  HEAVILY_PLAYED: 'HP',
  DAMAGED: 'DMG',
};

export const CONDITION_LABELS: Record<CardCondition, string> = {
  MINT: 'Mint',
  NEAR_MINT: 'Near mint',
  LIGHTLY_PLAYED: 'Lightly played',
  MODERATELY_PLAYED: 'Moderately played',
  HEAVILY_PLAYED: 'Heavily played',
  DAMAGED: 'Damaged',
};

export function freshnessColor(value: Freshness, palette: Palette): string {
  switch (value) {
    case 'FRESH':
      return palette.status.fresh;
    case 'AGING':
      return palette.status.aging;
    case 'STALE':
      return palette.status.stale;
    case 'HIDDEN':
      return palette.status.hidden;
    default:
      return assertNever(value, 'Unhandled freshness');
  }
}

function conditionTone(
  value: CardCondition,
  palette: Palette
): { background: string; color: string } {
  switch (value) {
    case 'MINT':
    case 'NEAR_MINT':
      return { background: palette.accentContainer, color: palette.onAccentContainer };
    case 'LIGHTLY_PLAYED':
    case 'MODERATELY_PLAYED':
      return { background: palette.primaryContainer, color: palette.onPrimaryContainer };
    case 'HEAVILY_PLAYED':
    case 'DAMAGED':
      return { background: palette.surfaceVariant, color: palette.textMuted };
    default:
      return assertNever(value, 'Unhandled condition');
  }
}

/**
 * Small status pill. `freshness` shows a coloured dot + label; `condition` shows the abbreviation
 * with the full label as accessible name (design-system "Card condition labels").
 */
export function Badge(props: BadgeProps) {
  const { palette } = useTheme();

  if (props.variant === 'freshness') {
    const color = freshnessColor(props.value, palette);
    const label = FRESHNESS_LABELS[props.value];
    return (
      <View
        testID={props.testID ?? `badge-freshness-${props.value}`}
        accessibilityLabel={`Freshness: ${label}`}
        style={[
          styles.base,
          { backgroundColor: palette.surfaceVariant, borderColor: palette.border },
          props.style,
        ]}
      >
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.label, { color: palette.ink }]}>{label}</Text>
      </View>
    );
  }

  const tone = conditionTone(props.value, palette);
  return (
    <View
      testID={props.testID ?? `badge-condition-${props.value}`}
      accessibilityLabel={`Condition: ${CONDITION_LABELS[props.value]}`}
      style={[
        styles.base,
        { backgroundColor: tone.background, borderColor: 'transparent' },
        props.style,
      ]}
    >
      <Text style={[styles.label, styles.mono, { color: tone.color }]}>
        {CONDITION_ABBREVIATIONS[props.value]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
  mono: { fontFamily: fontFamily.mono, letterSpacing: 0.5 },
});
