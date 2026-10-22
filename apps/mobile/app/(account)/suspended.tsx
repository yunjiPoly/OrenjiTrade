import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useFlowLock } from '@/src/account/flowLock';
import { isApiError } from '@/src/api/ApiError';
import { messageOf } from '@/src/api/errorMessages';
import { pendingDeletion, useCancelDeletion, useDeletionRequests } from '@/src/api/hooks/account';
import { useSession } from '@/src/auth/session';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { DELETION_COPY, SUSPENDED_COPY } from '@/src/features/account/accountCopy';
import { exportMyData } from '@/src/features/account/exportData';
import { StatusPage, StatusText } from '@/src/features/account/StatusPage';
import { formatLongDate } from '@/src/lib/dates';
import { fontWeight, useTheme } from '@/src/theme';

/** The flow lock's name while "Deletion cancelled" shows in place of the deletion. */
export const DELETION_CANCELLED_FLOW = 'deletion-cancelled';

/**
 * 44 Suspended and 45 Scheduled for deletion (stage R12, mockup v50; web: `/auth/suspended`):
 * centred with a 72 pt icon. A suspension (temporary, or without an end date when the account was
 * banned) says why and until when, with the support address, "Community guidelines" and Sign out.
 * A pending deletion (its 7-day grace period) offers "Cancel deletion", "Download my data" and Sign
 * out; once cancelled, "Deletion cancelled" and "Welcome back!" show in place (the gate is held
 * meanwhile) and Continue goes on.
 */
export default function SuspendedScreen() {
  const { palette } = useTheme();
  const session = useSession();
  const account = useAccount();
  const pending = account.status === 'deletion-pending';
  const requests = useDeletionRequests(pending);
  const cancel = useCancelDeletion();
  const snackbar = useSnackbar();
  const router = useRouter();
  const [working, setWorking] = useState<'cancel' | 'export' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  // Leaving the screen any other way never leaves the gate held.
  useEffect(
    () => () => {
      if (useFlowLock.getState().lockedBy === DELETION_CANCELLED_FLOW) {
        useFlowLock.getState().unlock();
      }
    },
    []
  );

  const request = pendingDeletion(requests.data);

  const cancelDeletion = async () => {
    if (!request) {
      return;
    }
    setWorking('cancel');
    setError(null);
    // "Deletion cancelled" shows here before the gate moves on (Continue releases it).
    useFlowLock.getState().lock(DELETION_CANCELLED_FLOW);
    try {
      await cancel.mutateAsync(request.id);
      setCancelled(true);
      // The account is active again; `/me` says so to the gate (Continue asks again if this fails).
      await account.reload().catch(() => undefined);
    } catch (caught) {
      useFlowLock.getState().unlock();
      setError(
        isApiError(caught) && caught.status === 401 ? DELETION_COPY.sessionEnded : messageOf(caught)
      );
    } finally {
      setWorking(null);
    }
  };

  const exportData = async () => {
    setWorking('export');
    setError(null);
    try {
      const name = await exportMyData(account.handle);
      snackbar.show(DELETION_COPY.exported(name));
    } catch (caught) {
      setError(messageOf(caught, DELETION_COPY.exportFailed));
    } finally {
      setWorking(null);
    }
  };

  /** Continue after "Deletion cancelled": releases the gate, which opens the app. */
  const proceed = async () => {
    if (account.status !== 'ready') {
      await account.reload().catch(() => undefined);
    }
    useFlowLock.getState().unlock();
  };

  const signOut = (
    <PillButton
      label={SUSPENDED_COPY.signOut}
      variant="quiet"
      disabled={working !== null}
      onPress={() => void session.signOut()}
      testID="suspended-sign-out"
    />
  );

  if (cancelled) {
    return (
      <StatusPage
        icon="check"
        tone="accent"
        title={DELETION_COPY.cancelledTitle}
        testID="screen-suspended"
        actions={
          <PillButton
            label={DELETION_COPY.continue}
            onPress={() => void proceed()}
            testID="deletion-cancelled-continue"
          />
        }
      >
        <StatusText testID="deletion-cancelled">{DELETION_COPY.cancelledText}</StatusText>
      </StatusPage>
    );
  }

  if (pending) {
    return (
      <StatusPage
        icon="trash-can-outline"
        tone="warning"
        title={DELETION_COPY.title}
        testID="screen-suspended"
        actions={
          requests.isPending ? null : (
            <>
              <PillButton
                label={DELETION_COPY.cancel}
                loading={working === 'cancel'}
                loadingLabel={DELETION_COPY.cancelling}
                disabled={!request || working === 'export'}
                onPress={() => void cancelDeletion()}
                testID="cancel-deletion"
              />
              <PillButton
                label={DELETION_COPY.download}
                variant="outline"
                icon="download"
                loading={working === 'export'}
                loadingLabel={DELETION_COPY.downloading}
                disabled={working === 'cancel'}
                onPress={() => void exportData()}
                testID="suspended-export"
              />
              {signOut}
            </>
          )
        }
      >
        {error ? (
          <FormMessage style={styles.notice} testID="suspended-error">
            {error}
          </FormMessage>
        ) : null}
        {requests.isPending ? (
          <SkeletonList rows={2} rowHeight={48} />
        ) : (
          <>
            <StatusText testID="deletion-scheduled">
              {request ? (
                <>
                  {DELETION_COPY.scheduledBefore}
                  <Text style={[styles.strong, { color: palette.ink }]}>
                    {formatLongDate(request.scheduledFor)}
                  </Text>
                  {DELETION_COPY.scheduledAfter}
                </>
              ) : (
                DELETION_COPY.noRequest
              )}
            </StatusText>
            <StatusText>{DELETION_COPY.changedMind}</StatusText>
          </>
        )}
      </StatusPage>
    );
  }

  const suspension = account.suspension;
  return (
    <StatusPage
      icon="shield-alert-outline"
      tone="danger"
      title={account.status === 'suspended' ? SUSPENDED_COPY.title : SUSPENDED_COPY.activeTitle}
      testID="screen-suspended"
      actions={
        <>
          <PillButton
            label={SUSPENDED_COPY.guidelines}
            variant="outline"
            onPress={() =>
              router.push({ pathname: '/legal/[key]', params: { key: 'community-guidelines' } })
            }
            testID="suspended-guidelines"
          />
          {signOut}
        </>
      }
    >
      <StatusText testID="suspension-message">
        {suspension?.message || SUSPENDED_COPY.defaultReason}
      </StatusText>
      {suspension?.until ? (
        <StatusText strong testID="suspension-until">
          {SUSPENDED_COPY.endsOn(formatLongDate(suspension.until))}
        </StatusText>
      ) : null}
      <StatusText>
        {SUSPENDED_COPY.contactBefore}
        <Text
          accessibilityRole="link"
          style={[styles.strong, { color: palette.accent }]}
          onPress={() =>
            void Linking.openURL(`mailto:${SUSPENDED_COPY.supportEmail}`).catch(() => undefined)
          }
        >
          {SUSPENDED_COPY.supportEmail}
        </Text>
        {SUSPENDED_COPY.contactAfter}
      </StatusText>
    </StatusPage>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: fontWeight.semibold },
  notice: { alignSelf: 'stretch' },
});
