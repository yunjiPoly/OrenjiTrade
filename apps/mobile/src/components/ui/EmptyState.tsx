import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import {
  TITLE_MAX_FONT_SCALE,
  fontSize,
  fontWeight,
  radius,
  spacing,
  textStyle,
  useTheme,
} from '@/src/theme';

import { Button } from './Button';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  /** What comes after the action (a secondary action with its own sheet, "Switch game"). */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * How far an empty state's description follows the system text size: up to the size its title
 * stops at (`xl` at `TITLE_MAX_FONT_SCALE`, 40 pt), so the title is never the smaller of the two.
 * Uncapped, the 16 pt description grew to about 50 pt at the largest accessibility size, above the
 * title's 40 (R8's review F4).
 */
export const EMPTY_STATE_DESCRIPTION_MAX_FONT_SCALE =
  (fontSize.xl * TITLE_MAX_FONT_SCALE) / fontSize.md;

/**
 * Centred illustration + copy for screens with nothing to show yet. The title follows the system
 * text size up to twice its size, as a screen's title does (`TITLE_MAX_FONT_SCALE`): at the
 * largest accessibility size it otherwise cut a word of an empty Inventory in two ("Your
 * inventor / y is empty", stage R8's walk). The description follows it up to the title's size.
 */
export function EmptyState({
  title,
  description,
  icon = 'cards-outline',
  actionLabel,
  onAction,
  children,
  style,
  testID = 'empty-state',
}: EmptyStateProps) {
  const { palette } = useTheme();

  return (
    <View testID={testID} style={[styles.container, style]} accessibilityRole="summary">
      <View style={[styles.iconWrap, { backgroundColor: palette.primaryContainer }]}>
        <MaterialCommunityIcons name={icon} size={32} color={palette.onPrimaryContainer} />
      </View>
      <Text
        maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
        style={[textStyle('xl', 'heading'), styles.title, { color: palette.ink }]}
      >
        {title}
      </Text>
      {description ? (
        <Text
          maxFontSizeMultiplier={EMPTY_STATE_DESCRIPTION_MAX_FONT_SCALE}
          style={[textStyle('md'), styles.description, { color: palette.textMuted }]}
        >
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          style={styles.action}
          testID={`${testID}-action`}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[8],
    gap: spacing[3],
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  title: { fontWeight: fontWeight.semibold, textAlign: 'center' },
  description: { textAlign: 'center', maxWidth: 320 },
  action: { marginTop: spacing[3], minWidth: 160 },
});
