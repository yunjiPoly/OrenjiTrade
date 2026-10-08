import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, textStyle, useTheme } from '@/src/theme';

/** A message above an offer or a trade (an answer sent, the offer changed, a refusal). */
export interface DealNoticeValue {
  tone: 'success' | 'info' | 'warning';
  message: string;
}

/**
 * The dismissable notice of the offer and trade screens (web: `op__notice` / `tp__notice`):
 * announced politely, as an alert for refusals.
 */
export function DealNotice({
  notice,
  onDismiss,
  testID,
}: {
  notice: DealNoticeValue;
  onDismiss: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  const color =
    notice.tone === 'success'
      ? palette.success
      : notice.tone === 'warning'
        ? palette.warning
        : palette.info;
  return (
    <View
      testID={testID}
      accessibilityRole={notice.tone === 'warning' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      style={[styles.notice, { borderColor: color, backgroundColor: palette.surfaceVariant }]}
    >
      <MaterialCommunityIcons
        name={
          notice.tone === 'success'
            ? 'check-circle-outline'
            : notice.tone === 'warning'
              ? 'alert-circle-outline'
              : 'information-outline'
        }
        size={20}
        color={color}
      />
      <Text
        testID={`${testID}-text`}
        style={[textStyle('sm'), styles.grow, { color: palette.ink }]}
      >
        {notice.message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss the message"
        hitSlop={8}
        onPress={onDismiss}
        testID={`${testID}-dismiss`}
      >
        <MaterialCommunityIcons name="close" size={18} color={palette.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
  },
  grow: { flex: 1 },
});
