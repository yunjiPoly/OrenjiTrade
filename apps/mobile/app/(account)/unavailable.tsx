import { StyleSheet } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useSession } from '@/src/auth/session';
import { PillButton } from '@/src/components/ui/PillButton';
import { Text } from '@/src/components/ui/Text';
import { UNAVAILABLE_COPY } from '@/src/features/account/accountCopy';
import { StatusPage, StatusText } from '@/src/features/account/StatusPage';
import { unavailableContent } from '@/src/features/account/unavailableContent';
import { fontFamily, useTheme } from '@/src/theme';

/**
 * 46 Could not load (stage R12, mockup v50): `GET /me` failed with nothing cached (offline at
 * launch, a server error, an ended session). Centred with a 72 pt icon: "Try again" or Sign out.
 * The words follow the error (`unavailableContent`): the mockup's when the phone is offline, the
 * API's own sentence and its `{errorCode} · {requestId}` line for an answer of the server.
 * Cached data never lands here; the OfflineBanner covers that case.
 */
export default function AccountUnavailableScreen() {
  const { palette } = useTheme();
  const session = useSession();
  const account = useAccount();
  const content = unavailableContent(account.error);

  return (
    <StatusPage
      icon={content.expired ? 'account-lock-outline' : 'refresh'}
      tone="neutral"
      title={content.title}
      testID="screen-unavailable"
      actions={
        <>
          <PillButton
            label={UNAVAILABLE_COPY.retry}
            loading={account.refreshing}
            loadingLabel={UNAVAILABLE_COPY.retrying}
            onPress={() => void account.reload()}
            testID="account-error-retry"
          />
          <PillButton
            label={UNAVAILABLE_COPY.signOut}
            variant="quiet"
            onPress={() => void session.signOut()}
            testID="unavailable-sign-out"
          />
        </>
      }
    >
      <StatusText testID="account-error">{content.text}</StatusText>
      {content.reference ? (
        <Text
          testID="account-error-reference"
          style={[styles.reference, { color: palette.textDisabled }]}
        >
          {content.reference}
        </Text>
      ) : null}
    </StatusPage>
  );
}

const styles = StyleSheet.create({
  reference: { fontFamily: fontFamily.mono, fontSize: 12, textAlign: 'center' },
});
