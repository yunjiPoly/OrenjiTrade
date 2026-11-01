import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  /**
   * The buttons stay at the bottom of the screen while the lines scroll above them (screen 44,
   * review fix 1 of the owner decisions of 2026-10-28, U5: at the largest text sizes the page was
   * four screens tall and Sign out, the one thing a suspended collector can do, came last). The
   * caller caps the buttons' words as for other pinned controls (`PINNED_MAX_FONT_SCALE`).
   */
  pinActions?: boolean;
  testID?: string;
}

/**
 * A page that says where the collector stands (stage R12, mockup v50 screens 38's sent state, 39,
 * 44, 45 and 46): a round icon, a title and its lines centred, the buttons at the bottom. It
 * scrolls when the text size makes it taller than the screen, the buttons then after the lines,
 * or pinned under them (`pinActions`).
 */
export function StatusPage({
  icon,
  tone,
  title,
  children,
  actions,
  iconSize = 72,
  pinActions = false,
  testID,
}: StatusPageProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  if (pinActions && actions) {
    return (
      <View testID={testID} style={[styles.fill, { backgroundColor: palette.background }]}>
        <Screen
          scroll
          fillHeight="below-header"
          testID={testID ? `${testID}-scroll` : undefined}
          contentContainerStyle={[styles.page, styles.pinnedPage]}
        >
          <StatusBody icon={icon} tone={tone} title={title} iconSize={iconSize}>
            {children}
          </StatusBody>
        </Screen>
        <View
          testID={testID ? `${testID}-actions` : undefined}
          style={[styles.pinned, { paddingBottom: insets.bottom + spacing[6] }]}
        >
          {actions}
        </View>
      </View>
    );
  }
  return (
    <Screen
      scroll
      safeBottom
      fillHeight="below-header"
      testID={testID}
      contentContainerStyle={styles.page}
    >
      <StatusBody icon={icon} tone={tone} title={title} iconSize={iconSize}>
        {children}
      </StatusBody>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </Screen>
  );
}

export interface StatusBodyProps {
  icon: IconName;
  tone: StatusTone;
  title: string;
  children?: ReactNode;
  iconSize?: 64 | 72;
  /** The space above the circle (the account states 40 pt; Report sent 60, Import done 28). */
  paddingTop?: number;
  testID?: string;
}

/**
 * A status page's round icon, title and lines, centred, without the page around them (stage R14:
 * "Report sent" and "Import done" sit under their screen's own top bar).
 */
export function StatusBody({
  icon,
  tone,
  title,
  children,
  iconSize = 72,
  paddingTop = spacing[10],
  testID,
}: StatusBodyProps) {
  const { palette } = useTheme();
  const colors = statusColors(tone, palette);
  return (
    <View style={[styles.body, { paddingTop }]} testID={testID}>
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
        <MaterialCommunityIcons name={icon} size={iconSize === 72 ? 34 : 30} color={colors.icon} />
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
  );
}

/** The buttons at the bottom of a status page or body (a pill, an outlined one). */
export function StatusActions({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
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
  fill: { flex: 1 },
  page: { paddingHorizontal: spacing[5] },
  // The bottom inset belongs to the pinned buttons.
  pinnedPage: { paddingBottom: spacing[6] },
  pinned: { paddingHorizontal: spacing[5], paddingTop: spacing[3], gap: spacing[2] },
  body: { alignItems: 'center', gap: spacing[3] },
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
