import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useMeta } from '@/src/api/queries/useMeta';
import { useSession } from '@/src/auth/SessionProvider';
import { Button } from '@/src/components/ui/Button';
import { Chip } from '@/src/components/ui/Chip';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Screen } from '@/src/components/ui/Screen';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { relativeTime } from '@/src/lib/relativeTime';
import { useAppStore, type ThemeOverride } from '@/src/store/useAppStore';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

const THEME_OPTIONS: { value: ThemeOverride; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function SectionTitle({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <Text style={[textStyle('sm'), styles.sectionTitle, { color: palette.textMuted }]}>
      {children}
    </Text>
  );
}

function Card({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      {children}
    </View>
  );
}

function ApiStatusCard() {
  const { palette } = useTheme();
  const meta = useMeta();

  if (meta.isPending) {
    return (
      <Card testID="api-status-loading">
        <Skeleton width="55%" height={18} />
        <Skeleton width="35%" height={14} />
        <Skeleton width="70%" height={14} />
      </Card>
    );
  }

  if (meta.isError) {
    return (
      <Card testID="api-status-error">
        <ErrorState
          compact
          error={meta.error}
          title="API unreachable"
          onRetry={() => void meta.refetch()}
          retryLabel={meta.isFetching ? 'Retrying…' : 'Retry'}
        />
      </Card>
    );
  }

  const { name, version, environment, serverTime } = meta.data;
  return (
    <Card testID="api-status-ready">
      <View style={styles.row}>
        <MaterialCommunityIcons name="server-network" size={20} color={palette.accent} />
        <Text style={[textStyle('md'), styles.cardTitle, { color: palette.ink }]}>{name}</Text>
      </View>
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
        Version{' '}
        <Text style={{ fontFamily: fontFamily.mono, color: palette.ink }} testID="api-version">
          {version}
        </Text>{' '}
        · {environment}
      </Text>
      <Text style={[textStyle('xs'), { color: palette.textDisabled }]}>
        Server time {relativeTime(serverTime)}
        {meta.isFetching ? ' · refreshing' : ''}
      </Text>
    </Card>
  );
}

/** Profile tab: session, appearance and API status. Account settings arrive in Phase 1. */
export default function ProfileScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  const themeOverride = useAppStore((state) => state.themeOverride);
  const setThemeOverride = useAppStore((state) => state.setThemeOverride);

  return (
    <Screen scroll testID="screen-profile">
      <View style={styles.section}>
        <SectionTitle>Account</SectionTitle>
        <Card testID="session-card">
          <View style={styles.row}>
            <View style={[styles.avatar, { backgroundColor: palette.primaryContainer }]}>
              <MaterialCommunityIcons
                name="account-outline"
                size={28}
                color={palette.onPrimaryContainer}
              />
            </View>
            <View style={styles.grow}>
              <Text style={[textStyle('md'), styles.cardTitle, { color: palette.ink }]}>
                {session.user?.displayName ?? 'Not signed in'}
              </Text>
              <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
                {session.user?.email ?? 'Sign in to publish binders and message collectors.'}
              </Text>
            </View>
          </View>
          {session.status === 'anonymous' ? (
            <View style={styles.actions}>
              <Button
                label="Sign in"
                onPress={() => router.push('/(auth)/sign-in')}
                style={styles.grow}
              />
              <Button
                label="Create account"
                variant="secondary"
                onPress={() => router.push('/(auth)/sign-up')}
                style={styles.grow}
              />
            </View>
          ) : null}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionTitle>Appearance</SectionTitle>
        <View style={styles.chips}>
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
      </View>

      <View style={styles.section}>
        <SectionTitle>API</SectionTitle>
        <ApiStatusCard />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing[2], marginBottom: spacing[6] },
  sectionTitle: { fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing[4], gap: spacing[2] },
  cardTitle: { fontWeight: fontWeight.semibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] },
  chips: { flexDirection: 'row', gap: spacing[2] },
});
