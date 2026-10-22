import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/src/components/ui/Screen';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, spacing, textStyle, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';
import type { Palette } from '@/src/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** The colour of a status page's round icon (mockup v50: orange, teal, red, amber or stone). */
export type StatusTone = 'primary' | 'accent' | 'danger' | 'warning' | 'neutral';

/** `#RRGGBB` with an alpha, as the mockup's `rgba(…, 0.12)` circles. */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) {
    return hex;
  }
  const value = parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** The icon's colour and its circle's fill for a tone. */
export function statusColors(tone: StatusTone, palette: Palette): { icon: string; fill: string } {
  switch (tone) {
    case 'primary':
      return { icon: palette.primary, fill: withAlpha(palette.primary, 0.12) };
    case 'accent':
      return { icon: palette.accent, fill: withAlpha(palette.accent, 0.12) };
    case 'danger':
      return { icon: palette.danger, fill: withAlpha(palette.danger, 0.12) };
    case 'warning':
      return { icon: palette.warning, fill: withAlpha(palette.warning, 0.12) };
    default:
      return { icon: palette.textMuted, fill: palette.surfaceVariant };
  }
}

export interface StatusPageProps {
  icon: IconName;
  tone: StatusTone;
  title: string;
  /** The lines under the title (centred `StatusText`s, a notice). */
  children?: ReactNode;
  /** The buttons at the bottom of the page (a pill, an outlined one, a quiet one). */
  actions?: ReactNode;
  /** 72 pt (the account states, Verify your email) or 64 pt (Reset password's sent state). */
  iconSize?: 64 | 72;
  testID?: string;
}

/**
 * A page that says where the collector stands (stage R12, mockup v50 screens 38's sent state, 39,
 * 44, 45 and 46): a round icon, a title and its lines centred, the buttons at the bottom. It
 * scrolls when the text size makes it taller than the screen, the buttons then after the lines.
 */
export function StatusPage({
  icon,
  tone,
  title,
  children,
  actions,
  iconSize = 72,
  testID,
}: StatusPageProps) {
  const { palette } = useTheme();
  const colors = statusColors(tone, palette);
  return (
    <Screen scroll safeBottom testID={testID} contentContainerStyle={styles.page}>
      <View style={styles.body}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.circle,
            {
              width: iconSize,
              height: iconSize,
              borderRadius: iconSize / 2,
              backgroundColor: colors.fill,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={icon}
            size={iconSize === 72 ? 34 : 30}
            color={colors.icon}
          />
        </View>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[textStyle('2xl', 'heading'), styles.title, { color: palette.ink }]}
        >
          {title}
        </Text>
        {children}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </Screen>
  );
}

/** A centred line of a status page (muted; `strong` for the date that matters). */
export function StatusText({
  children,
  strong = false,
  testID,
}: {
  children: ReactNode;
  strong?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Text
      testID={testID}
      style={[
        textStyle('md'),
        styles.line,
        strong && styles.strong,
        { color: strong ? palette.ink : palette.textMuted },
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: spacing[5] },
  body: { paddingTop: spacing[10], alignItems: 'center', gap: spacing[3] },
  circle: { alignItems: 'center', justifyContent: 'center' },
  title: {
    marginTop: 6,
    textAlign: 'center',
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
  },
  line: { maxWidth: 340, textAlign: 'center' },
  strong: { fontWeight: fontWeight.semibold },
  actions: { marginTop: 'auto', paddingTop: spacing[6], gap: spacing[2] },
});
