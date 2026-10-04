import { StyleSheet, Text, View } from 'react-native';

import { useMeta } from '@/src/api/hooks/meta';
import { Chip } from '@/src/components/ui/Chip';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { relativeTime } from '@/src/lib/relativeTime';
import { useAppStore, type ThemeOverride } from '@/src/store/useAppStore';
import { fontFamily, spacing, textStyle, useTheme } from '@/src/theme';

const THEME_OPTIONS: { value: ThemeOverride; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function ApiStatus() {
  const { palette } = useTheme();
  const meta = useMeta();
  if (meta.isPending) {
    return (
      <View testID="api-status-loading" style={styles.status}>
        <Skeleton width="55%" height={18} />
        <Skeleton width="35%" height={14} />
      </View>
    );
  }
  if (meta.isError) {
    return (
      <ErrorState
        compact
        error={meta.error}
        title="API unreachable"
        onRetry={() => void meta.refetch()}
        testID="api-status-error"
      />
    );
  }
  return (
    <View testID="api-status-ready" style={styles.status}>
      <Text style={[textStyle('md'), { color: palette.ink }]}>{meta.data.name}</Text>
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
        Version{' '}
        <Text style={{ fontFamily: fontFamily.mono, color: palette.ink }} testID="api-version">
          {meta.data.version}
        </Text>{' '}
        · {meta.data.environment} · server time {relativeTime(meta.data.serverTime)}
      </Text>
    </View>
  );
}

/** Settings → Appearance: theme override (stored on the device) and app information. */
export default function AppearanceSettingsScreen() {
  const themeOverride = useAppStore((state) => state.themeOverride);
  const setThemeOverride = useAppStore((state) => state.setThemeOverride);
  return (
    <Screen scroll safeBottom testID="screen-settings-appearance">
      <View style={styles.root}>
        <SectionCard title="Theme">
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Theme">
            {THEME_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={themeOverride === option.value}
                onPress={() => setThemeOverride(option.value)}
                testID={`theme-${option.value}`}
              />
            ))}
          </View>
        </SectionCard>
        <SectionCard title="About">
          <ApiStatus />
        </SectionCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  chips: { flexDirection: 'row', gap: spacing[2] },
  status: { gap: spacing[1] },
});
