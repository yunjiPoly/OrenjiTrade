import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme, type ViewStyleProp } from '@/src/theme';

import { Button } from './Button';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyleProp;
  testID?: string;
}

/** Centred illustration + copy for screens with nothing to show yet. */
export function EmptyState({
  title,
  description,
  icon = 'cards-outline',
  actionLabel,
  onAction,
  style,
  testID = 'empty-state',
}: EmptyStateProps) {
  const { palette } = useTheme();

  return (
    <View testID={testID} style={[styles.container, style]} accessibilityRole="summary">
      <View style={[styles.iconWrap, { backgroundColor: palette.primaryContainer }]}>
        <MaterialCommunityIcons name={icon} size={32} color={palette.onPrimaryContainer} />
      </View>
      <Text style={[textStyle('xl', 'heading'), styles.title, { color: palette.ink }]}>
        {title}
      </Text>
      {description ? (
        <Text style={[textStyle('md'), styles.description, { color: palette.textMuted }]}>
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
