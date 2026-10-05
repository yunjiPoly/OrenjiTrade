import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing, textStyle, useTheme } from '@/src/theme';

export interface ListFooterProps {
  /** The next page is loading. */
  loading: boolean;
  /** The next page failed (the list keeps what it has). */
  failed: boolean;
  onRetry: () => void;
  testID?: string;
}

/** Footer of an infinite list: a spinner while the next page loads, a retry when it failed. */
export function ListFooter({ loading, failed, onRetry, testID = 'list-footer' }: ListFooterProps) {
  const { palette } = useTheme();
  if (loading) {
    return (
      <View style={styles.footer} accessibilityLabel="Loading more" testID={`${testID}-loading`}>
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }
  if (failed) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More results could not load. Try again."
        onPress={onRetry}
        style={styles.footer}
        testID={`${testID}-retry`}
      >
        <Text style={[textStyle('sm'), { color: palette.danger }]}>
          More results could not load. Tap to try again.
        </Text>
      </Pressable>
    );
  }
  return <View style={styles.space} />;
}

const styles = StyleSheet.create({
  footer: { paddingVertical: spacing[4], alignItems: 'center' },
  space: { height: spacing[4] },
});
