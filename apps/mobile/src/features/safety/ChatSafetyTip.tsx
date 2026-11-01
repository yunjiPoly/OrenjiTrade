import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { radius, spacing, textStyle, useTheme } from '@/src/theme';

import { chatSafetyTip, type DealSide } from './chatSafetyTips';

export interface ChatSafetyTipProps {
  /** Which side of the deal the reader is on (`none` in a chat without a pinned card). */
  side: DealSide;
  testID?: string;
}

/**
 * The small safety tip with a shield at the top of a chat (mockup screens 23 and 24): one line
 * per side, never dismissed, never in the way of the composer. It replaced the meetup notice of
 * the conversation (ADR 0018). Tapping it opens the "Trading safely" page (said to screen
 * readers as a hint; the look stays the mockup's plain tip).
 */
export function ChatSafetyTip({ side, testID = 'chat-safety-tip' }: ChatSafetyTipProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const text = chatSafetyTip(side);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Safety tip: ${text}`}
      accessibilityHint="Opens the Trading safely advice."
      onPress={() => router.push({ pathname: '/legal/[key]', params: { key: 'trading-safely' } })}
      testID={testID}
      style={({ pressed }) => [
        styles.tip,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons
        name="shield-check-outline"
        size={16}
        color={palette.accent}
        style={styles.icon}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text
        testID={`${testID}-text`}
        style={[textStyle('xs'), styles.text, { color: palette.textMuted }]}
      >
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    maxWidth: 340,
    minHeight: 44,
    marginVertical: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  icon: { marginTop: 1 },
  text: { flexShrink: 1 },
  pressed: { opacity: 0.8 },
});
