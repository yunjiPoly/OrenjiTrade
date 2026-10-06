import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { limitReachedInfo, limitReachedMessage } from '@/src/lib/limits';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { SeePremiumButton } from './SeePremiumButton';

export interface LimitReachedNoticeProps {
  error: ApiError;
  title?: string;
  testID?: string;
}

/**
 * Explains a reached freemium limit where it happened (429 `LIMIT_REACHED`): what is counted,
 * how much was used of the plan's allowance, when it resets or how to get more, and "See Premium"
 * while premium plans are sold.
 */
export function LimitReachedNotice({
  error,
  title = 'You reached a plan limit',
  testID = 'limit-reached',
}: LimitReachedNoticeProps) {
  const { palette } = useTheme();
  const info = limitReachedInfo(error);
  const percent =
    info.used !== null && info.limit
      ? Math.min(100, Math.round((info.used / info.limit) * 100))
      : null;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.root,
        { borderColor: palette.warning, backgroundColor: palette.surfaceVariant },
      ]}
    >
      <View style={styles.head}>
        <MaterialCommunityIcons name="speedometer" size={20} color={palette.warning} />
        <Text style={[textStyle('md'), styles.title, { color: palette.ink }]}>{title}</Text>
      </View>
      <Text testID={`${testID}-message`} style={[textStyle('sm'), { color: palette.ink }]}>
        {limitReachedMessage(info)}
      </Text>
      {percent !== null ? (
        <View style={[styles.meter, { backgroundColor: palette.border }]}>
          <View style={[styles.fill, { width: `${percent}%`, backgroundColor: palette.warning }]} />
        </View>
      ) : null}
      <SeePremiumButton testID={`${testID}-premium`} style={styles.premium} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2], padding: spacing[3], borderRadius: radius.md, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  title: { fontWeight: fontWeight.semibold, flex: 1 },
  meter: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 6 },
  premium: { alignSelf: 'flex-start' },
});
