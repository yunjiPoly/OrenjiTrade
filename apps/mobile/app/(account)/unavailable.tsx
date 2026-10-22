import { useAccount } from '@/src/account/AccountProvider';
import { useSession } from '@/src/auth/session';
import { PillButton } from '@/src/components/ui/PillButton';
import { UNAVAILABLE_COPY } from '@/src/features/account/accountCopy';
import { StatusPage, StatusText } from '@/src/features/account/StatusPage';

/**
 * 46 Could not load (stage R12, mockup v50): `GET /me` failed with nothing cached (offline at
 * launch, a server error, an ended session). Centred with a 72 pt icon: "Try again" or Sign out.
 * Cached data never lands here; the OfflineBanner covers that case.
 */
export default function AccountUnavailableScreen() {
  const session = useSession();
  const account = useAccount();
  const expired = account.error?.status === 401;

  return (
    <StatusPage
      icon={expired ? 'account-lock-outline' : 'refresh'}
      tone="neutral"
      title={expired ? UNAVAILABLE_COPY.expiredTitle : UNAVAILABLE_COPY.title}
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
      <StatusText testID="account-error">
        {expired ? UNAVAILABLE_COPY.expiredText : UNAVAILABLE_COPY.text}
      </StatusText>
    </StatusPage>
  );
}
