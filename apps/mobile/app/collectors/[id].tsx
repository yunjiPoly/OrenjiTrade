import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useCollectorProfile } from '@/src/api/hooks/collectors';
import { useSessionNotice } from '@/src/auth/sessionNotice';
import { useSession } from '@/src/auth/session';
import { Button } from '@/src/components/ui/Button';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Screen } from '@/src/components/ui/Screen';
import { Skeleton, SkeletonList } from '@/src/components/ui/Skeleton';
import { CollectorProfileView } from '@/src/features/collectors/CollectorProfileView';
import { spacing, textStyle, useTheme } from '@/src/theme';

/**
 * A collector's public profile (`GET /collectors/{handle}`, the web's `/collectors/:handle`); for
 * the owner it is the "public preview". Deep links: orenjitrade://collectors/<handle> and
 * https://www.orenjitrade.com/collectors/<handle>.
 *
 * Like the web: members only (signed out, or a 401: "Collector profiles are for members");
 * 404 covers unknown, PRIVATE, suspended and deleted collectors alike ("not available"), so
 * nothing leaks about why. Location: a label, a distance bucket and a 3 km zone, never a point.
 */
export default function CollectorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const account = useAccount();
  const signedOut = account.status === 'anonymous';
  const profile = useCollectorProfile(signedOut ? null : id);
  const isOwn = !!profile.data && account.me?.id === profile.data.id;

  let content;
  if (signedOut || profile.error?.status === 401) {
    content = <MembersOnly />;
  } else if (profile.data) {
    content = <CollectorProfileView profile={profile.data} isOwn={isOwn} />;
  } else if (profile.error?.status === 404) {
    content = <NotAvailable />;
  } else if (profile.error) {
    content = (
      <ErrorState
        testID="collector-error"
        error={profile.error}
        title="We could not load this profile"
        onRetry={() => void profile.refetch()}
        retryLabel={profile.isFetching ? 'Retrying…' : 'Try again'}
      />
    );
  } else {
    content = (
      <View testID="collector-loading" accessibilityLabel="Loading the collector profile" aria-busy>
        <View style={styles.loadingHead}>
          <Skeleton width={72} height={72} radius={36} />
          <View style={styles.grow}>
            <Skeleton width="70%" height={24} />
            <Skeleton width="40%" height={16} />
          </View>
        </View>
        <SkeletonList rows={3} rowHeight={96} />
      </View>
    );
  }

  return (
    <Screen scroll safeBottom testID="screen-collector">
      <Stack.Screen
        options={{ title: profile.data?.displayName ?? (id ? `@${id}` : 'Collector') }}
      />
      {content}
    </Screen>
  );
}

function MembersOnly() {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  // A 401 while signed in means the session itself ended: sign out (the gate then opens sign-in
  // and reopens this profile afterwards) instead of pushing a sign-in screen the gate would send
  // straight back to the tabs.
  const signedIn = session.status === 'authenticated';
  const go = (screen: '/sign-in' | '/sign-up') => {
    if (signedIn) {
      useSessionNotice.getState().reportEnded();
    } else {
      router.push(screen);
    }
  };
  return (
    <View testID="collector-members-only" accessibilityRole="summary" style={styles.centered}>
      <Text style={[textStyle('xl', 'heading'), styles.title, { color: palette.ink }]}>
        Collector profiles are for members
      </Text>
      <Text style={[textStyle('md'), styles.title, { color: palette.textMuted }]}>
        Sign in or create a free account to see who trades near you.
      </Text>
      <Button label="Sign in" onPress={() => go('/sign-in')} testID="collector-sign-in" />
      <Button
        label="Create account"
        variant="secondary"
        onPress={() => go('/sign-up')}
        testID="collector-sign-up"
      />
    </View>
  );
}

function NotAvailable() {
  const router = useRouter();
  return (
    <EmptyState
      testID="collector-not-found"
      icon="account-off-outline"
      title="This collector is not available"
      description="The profile does not exist, is private, or is no longer active."
      actionLabel="Back to the map"
      onAction={() => router.navigate('/')}
    />
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, gap: spacing[2] },
  loadingHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    marginBottom: spacing[4],
  },
  centered: { gap: spacing[3], paddingVertical: spacing[8], alignItems: 'stretch' },
  title: { textAlign: 'center' },
});
