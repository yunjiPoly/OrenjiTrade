import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { isApiError } from '@/src/api/ApiError';
import { messageOf } from '@/src/api/errorMessages';
import { pendingDeletion, useCancelDeletion, useDeletionRequests } from '@/src/api/hooks/account';
import { useSession } from '@/src/auth/session';
import { Button } from '@/src/components/ui/Button';
import { FormMessage } from '@/src/components/ui/FormControls';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { exportMyData } from '@/src/features/account/exportData';
import { formatDateTime, formatLongDate } from '@/src/lib/dates';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

const SUPPORT_EMAIL = 'support@orenjitrade.com';

/**
 * Why the account cannot be used (web: `/auth/suspended`): a suspension (temporary, or without an
 * end date when the account was banned) or a pending deletion during its 7-day grace period, with
 * "Cancel deletion" and "Download my data".
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

  const request = pendingDeletion(requests.data);
  const heading = pending
    ? 'Your account is scheduled for deletion'
    : account.status === 'suspended'
      ? 'Your account is suspended'
      : 'Your account is active';

  const cancelDeletion = async () => {
    if (!request) {
      return;
    }
    setWorking('cancel');
    setError(null);
    try {
      await cancel.mutateAsync(request.id);
      await account.reload();
      snackbar.show('Deletion cancelled. Welcome back!');
    } catch (caught) {
      setError(
        isApiError(caught) && caught.status === 401
          ? 'Your session ended. Sign in again, then cancel the deletion.'
          : messageOf(caught)
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
      snackbar.show(`Your data export ${name} is ready.`);
    } catch (caught) {
      setError(messageOf(caught, 'The export failed. Please try again.'));
    } finally {
      setWorking(null);
    }
  };

  return (
    <Screen scroll safeBottom testID="screen-suspended">
      <Text
        accessibilityRole="header"
        style={[textStyle('2xl', 'heading'), styles.title, { color: palette.ink }]}
      >
        {heading}
      </Text>
      <View style={styles.body}>
        {error ? <FormMessage>{error}</FormMessage> : null}
        {pending ? (
          requests.isPending ? (
            <SkeletonList rows={2} rowHeight={48} />
          ) : (
            <>
              <FormMessage tone="info" testID="deletion-scheduled">
                {request
                  ? `Your account and profile will be permanently deleted on ${formatLongDate(request.scheduledFor)}. Until then you are hidden from the map and search.`
                  : 'Your account is hidden while its deletion is pending.'}
              </FormMessage>
              <Text style={[textStyle('md'), { color: palette.textMuted }]}>
                Changed your mind? Cancel the deletion to restore everything exactly as it was. You
                can also download a copy of your data first.
              </Text>
              <Button
                label="Cancel deletion"
                loading={working === 'cancel'}
                disabled={!request || working !== null}
                onPress={() => void cancelDeletion()}
                testID="cancel-deletion"
              />
              <Button
                label="Download my data"
                variant="secondary"
                icon="download"
                loading={working === 'export'}
                disabled={working !== null}
                onPress={() => void exportData()}
                testID="suspended-export"
              />
            </>
          )
        ) : (
          <>
            <FormMessage testID="suspension-message">
              {account.suspension?.message || 'This account is suspended.'}
              {account.suspension?.until
                ? ` The suspension ends on ${formatDateTime(account.suspension.until)}.`
                : ''}
            </FormMessage>
            <Text style={[textStyle('md'), { color: palette.textMuted }]}>
              While suspended you cannot use OrenjiTrade. If you think this is a mistake, contact{' '}
              <Text
                accessibilityRole="link"
                style={[styles.link, { color: palette.accent }]}
                onPress={() =>
                  void Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => undefined)
                }
              >
                {SUPPORT_EMAIL}
              </Text>{' '}
              and quote your account email.
            </Text>
            <Button
              label="Community guidelines"
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/legal/[key]', params: { key: 'community-guidelines' } })
              }
            />
          </>
        )}
        <Button
          label="Sign out"
          variant="ghost"
          onPress={() => void session.signOut()}
          testID="suspended-sign-out"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: fontWeight.bold, marginBottom: spacing[4] },
  body: { gap: spacing[4] },
  link: { fontWeight: fontWeight.semibold, textDecorationLine: 'underline' },
});
