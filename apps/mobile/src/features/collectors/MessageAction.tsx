import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

export interface MessageActionProps {
  displayName: string;
  /** The API's answer for this viewer (the collector's messaging permission and blocks). */
  canMessage: boolean;
  isBlocked: boolean;
  starting: boolean;
  onMessage: () => void;
  variant?: 'primary' | 'secondary';
  testID?: string;
}

/**
 * "Message" exactly as the web offers it: enabled only when the API says the viewer may write
 * (`canMessage`); otherwise disabled with the reason (a block, or the collector's messaging
 * permission). Never shown on the viewer's own profile or preview (callers leave it out).
 */
export function MessageAction({
  displayName,
  canMessage,
  isBlocked,
  starting,
  onMessage,
  variant = 'secondary',
  testID = 'message-action',
}: MessageActionProps) {
  const { palette } = useTheme();
  const router = useRouter();
  if (canMessage) {
    return (
      <Button
        label="Message"
        loading={starting}
        loadingLabel="Opening…"
        icon="message-text-outline"
        variant={variant}
        onPress={onMessage}
        accessibilityHint={`Opens your conversation with ${displayName}`}
        testID={testID}
      />
    );
  }
  const reason = isBlocked
    ? 'Messaging is unavailable because of a block. Manage blocks in Settings.'
    : `${displayName} does not accept messages from you.`;
  return (
    <View style={styles.disabled}>
      <Button
        label="Message"
        icon="message-text-outline"
        variant={variant}
        disabled
        accessibilityHint={reason}
        testID={testID}
      />
      <Text testID={`${testID}-reason`} style={[textStyle('sm'), { color: palette.textMuted }]}>
        {reason}
      </Text>
      {isBlocked ? (
        <Text
          accessibilityRole="link"
          onPress={() => router.push('/settings/blocked')}
          testID={`${testID}-blocked-users`}
          style={[textStyle('sm'), styles.link, { color: palette.accent }]}
        >
          Blocked users
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  disabled: { gap: spacing[1] },
  link: { fontWeight: fontWeight.semibold },
});
