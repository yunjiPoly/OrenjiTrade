import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { fontWeight, PINNED_MAX_FONT_SCALE, spacing, useTheme } from '@/src/theme';

export interface UnderlineTab<T extends string> {
  value: T;
  label: string;
  /** A number after the label, in the muted colour ("Cards 20"). */
  count?: number | null;
  /** An orange dot after the label (stage R11: "Chats" while a chat is unread). */
  dot?: boolean;
  /** What a screen reader says instead of the label ("Chats, 2 unread"). */
  spokenLabel?: string;
}

export interface UnderlineTabsProps<T extends string> {
  /** What the tab list switches ("Inventory view"). */
  label: string;
  tabs: readonly UnderlineTab<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  /** Each tab is `<testID>-<value>`. */
  testID?: string;
}

/**
 * A row of text tabs over a hairline, the selected one underlined in orange (mockup v32: the
 * "Cards 20 | Binders 4" switch of the Inventory). The labels follow the system text size a
 * little only: the switch stays above a scrolling list.
 */
export function UnderlineTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
  style,
  testID,
}: UnderlineTabsProps<T>) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      testID={testID}
      style={[styles.root, { borderBottomColor: palette.border }, style]}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        const spoken =
          tab.spokenLabel ??
          (tab.count === null || tab.count === undefined
            ? tab.label
            : `${tab.label}, ${tab.count}`);
        return (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityLabel={spoken}
            accessibilityShowsLargeContentViewer
            accessibilityLargeContentTitle={spoken}
            aria-selected={selected}
            onPress={() => onChange(tab.value)}
            testID={testID ? `${testID}-${tab.value}` : undefined}
            style={({ pressed }) => [
              styles.tab,
              { borderBottomColor: selected ? palette.primary : 'transparent' },
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.labelRow}>
              <Text
                maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                style={[
                  styles.label,
                  {
                    color: selected ? palette.ink : palette.textMuted,
                    fontWeight: selected ? fontWeight.semibold : fontWeight.medium,
                  },
                ]}
              >
                {tab.label}
                {tab.count === null || tab.count === undefined ? null : (
                  <Text style={[styles.count, { color: palette.textMuted }]}> {tab.count}</Text>
                )}
              </Text>
              {tab.dot ? (
                <View
                  testID={testID ? `${testID}-${tab.value}-dot` : undefined}
                  style={[styles.dot, { backgroundColor: palette.primary }]}
                />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', gap: 22, borderBottomWidth: 1 },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
    borderBottomWidth: 2,
    marginBottom: -1,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 15, lineHeight: 20 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  count: { fontWeight: fontWeight.medium },
  pressed: { opacity: 0.8 },
});
