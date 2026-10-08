import { StyleSheet, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useSession } from '@/src/auth/session';
import { Button } from '@/src/components/ui/Button';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Screen } from '@/src/components/ui/Screen';
import { spacing } from '@/src/theme';

/**
 * `GET /me` failed with nothing cached (offline at launch, server error, session expired): retry,
 * or sign out. Cached data never lands here; the OfflineBanner covers that case.
 */
export default function AccountUnavailableScreen() {
  const session = useSession();
  const account = useAccount();
  const expired = account.error?.status === 401;

  return (
    <Screen testID="screen-unavailable">
      <View style={styles.body}>
        <ErrorState
          error={account.error}
          title={expired ? 'Please sign in again' : 'We could not load your account'}
          onRetry={() => void account.reload()}
          retryLabel={account.refreshing ? 'Retrying…' : 'Try again'}
          testID="account-error"
        />
        <Button
          label="Sign out"
          variant="ghost"
          onPress={() => void session.signOut()}
          testID="unavailable-sign-out"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: spacing[4] },
});
