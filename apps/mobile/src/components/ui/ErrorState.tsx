import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import {
  fontFamily,
  fontWeight,
  radius,
  spacing,
  textStyle,
  useTheme,
  type ViewStyleProp,
} from '@/src/theme';

import { Button } from './Button';

export interface ErrorStateProps {
  /** Any error; `ApiError` instances show their code and request id. */
  error?: unknown;
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  style?: ViewStyleProp;
  testID?: string;
}

function describe(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    return friendlyMessage(error);
  }
  return fallback;
}

/** Error state with retry, required for every screen (docs/design/design-system.md). */
export function ErrorState({
  error,
  title = 'Something went wrong',
  message = 'We could not load this right now.',
  onRetry,
  retryLabel = 'Try again',
  compact = false,
  style,
  testID = 'error-state',
}: ErrorStateProps) {
  const { palette } = useTheme();
  const apiError = isApiError(error) ? error : null;
  const resolvedTitle = apiError?.isNetworkError ? 'You appear to be offline' : title;

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={[styles.container, compact && styles.compact, style]}
    >
      <View style={[styles.iconWrap, { backgroundColor: palette.surfaceVariant }]}>
        <MaterialCommunityIcons
          name={apiError?.isNetworkError ? 'wifi-off' : 'alert-circle-outline'}
          size={28}
          color={palette.danger}
        />
      </View>
      <Text style={[textStyle('lg', 'heading'), styles.title, { color: palette.ink }]}>
        {resolvedTitle}
      </Text>
      <Text style={[textStyle('sm'), styles.message, { color: palette.textMuted }]}>
        {describe(error, message)}
      </Text>
      {apiError && !apiError.isNetworkError ? (
        <Text style={[styles.meta, { color: palette.textDisabled, fontFamily: fontFamily.mono }]}>
          {apiError.errorCode}
          {apiError.requestId ? ` · ${apiError.requestId}` : ''}
        </Text>
      ) : null}
      {onRetry ? (
        <Button
          label={retryLabel}
          variant="secondary"
          onPress={onRetry}
          style={styles.action}
          testID={`${testID}-retry`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[8],
    gap: spacing[2],
  },
  compact: { paddingVertical: spacing[4] },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[1],
  },
  title: { fontWeight: fontWeight.semibold, textAlign: 'center' },
  message: { textAlign: 'center', maxWidth: 320 },
  meta: { fontSize: 12, textAlign: 'center' },
  action: { marginTop: spacing[2] },
});
