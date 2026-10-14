import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

export interface PillButtonProps {
  label: string;
  onPress?: () => void;
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
  /** Greyed and not pressable ("No changes yet"). */
  disabled?: boolean;
  loading?: boolean;
  /** What a screen reader says while loading ("Adding…"). */
  loadingLabel?: string;
  /** `large`: the 52 pt main button of a screen; `small`: the 44 pt "Add cards" of a header. */
  size?: 'large' | 'small';
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The orange pill of mockup v32 (the main button of a screen, "Add cards" in the Inventory
 * header). Disabled, it turns grey and says why in its own words ("No changes yet").
 */
export function PillButton({
  label,
  onPress,
  icon,
  disabled = false,
  loading = false,
  loadingLabel,
  size = 'large',
  accessibilityHint,
  style,
  testID,
}: PillButtonProps) {
  const { palette } = useTheme();
  const inactive = disabled || loading;
  const color = disabled ? palette.availability.notAvailable : palette.onPrimary;
  const text = loading && loadingLabel ? loadingLabel : label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint={accessibilityHint}
      aria-disabled={inactive}
      aria-busy={loading}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        size === 'large' ? styles.large : styles.small,
        { backgroundColor: disabled ? palette.surfaceVariant : palette.primary },
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={color} />
        ) : icon ? (
          <MaterialCommunityIcons name={icon} size={size === 'large' ? 20 : 18} color={color} />
        ) : null}
        <Text
          style={[
            textStyle(size === 'large' ? 'md' : 'sm'),
            styles.label,
            { color, fontSize: size === 'large' ? 16 : 15 },
          ]}
          numberOfLines={2}
        >
          {text}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  large: {
    minHeight: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
  },
  small: {
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 14,
    paddingRight: 18,
    paddingVertical: spacing[1],
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontWeight: fontWeight.bold, textAlign: 'center' },
  pressed: { opacity: 0.85 },
});
