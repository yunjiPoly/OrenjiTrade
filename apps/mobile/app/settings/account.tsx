import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { messageOf } from '@/src/api/errorMessages';
import { authErrorMessage } from '@/src/auth/authErrors';
import { useSession } from '@/src/auth/session';
import { Button } from '@/src/components/ui/Button';
import { Divider, SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { exportMyData } from '@/src/features/account/exportData';
import { formatLongDate } from '@/src/lib/dates';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

const ROLE_LABELS: Record<string, string> = {
  PREMIUM_USER: 'Premium',
  MODERATOR: 'Moderator',
  ADMIN: 'Administrator',
  SUPER_ADMIN: 'Super administrator',
};

function Row({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[textStyle('md'), styles.rowLabel, { color: palette.ink }]}>{label}</Text>
      <Text testID={testID} style={[textStyle('sm'), { color: palette.textMuted }]}>
        {value}
      </Text>
    </View>
  );
}

/** Settings → Account (web: `/settings/account`): email, plan, data export, deletion, sign out. */
export default function AccountSettingsScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  const account = useAccount();
  const snackbar = useSnackbar();
  const [exporting, setExporting] = useState(false);
  const [sending, setSending] = useState(false);
  const verified = session.user?.emailVerified ?? false;
  const roles = (account.me?.roles ?? [])
    .filter((role) => role !== 'USER')
    .map((role) => ROLE_LABELS[role] ?? role);

  const resendVerification = async () => {
    setSending(true);
    try {
      await session.sendEmailVerification();
      snackbar.show('Verification email sent. Check your inbox.');
    } catch (caught) {
      snackbar.show(authErrorMessage(caught), { tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const name = await exportMyData(account.handle);
      snackbar.show(`Your data export ${name} is ready.`);
    } catch (caught) {
      snackbar.show(messageOf(caught, 'The export failed. Please try again.'), { tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen scroll safeBottom testID="screen-settings-account">
      <View style={styles.root}>
        <SectionCard title="Sign-in" description="How you access OrenjiTrade.">
          <Row label="Email" value={session.user?.email ?? '—'} testID="account-email" />
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.badge,
                { backgroundColor: verified ? palette.accentContainer : palette.surfaceVariant },
              ]}
            >
              <MaterialCommunityIcons
                name={verified ? 'check-decagram' : 'alert-circle-outline'}
                size={16}
                color={verified ? palette.onAccentContainer : palette.warning}
              />
              <Text style={[textStyle('sm'), { color: palette.ink }]} testID="account-verified">
                {verified ? 'Verified' : 'Not verified'}
              </Text>
            </View>
            {!verified ? (
              <Button
                label="Resend link"
                variant="ghost"
                loading={sending}
                onPress={() => void resendVerification()}
              />
            ) : null}
          </View>
          <Divider />
          <Row label="Sign-in method" value="Email and password" />
          {account.me ? (
            <>
              <Divider />
              <Row label="Member since" value={formatLongDate(account.me.createdAt)} />
            </>
          ) : null}
        </SectionCard>

        <SectionCard title="Plan" description="Your OrenjiTrade membership.">
          <Row
            label="Current plan"
            value={account.me?.plan === 'FREE' ? 'Free' : (account.me?.plan ?? '—')}
          />
          {roles.length > 0 ? <Row label="Staff roles" value={roles.join(', ')} /> : null}
        </SectionCard>

        <SectionCard
          title="Your data"
          description="Download everything OrenjiTrade stores about you as a JSON file."
        >
          <Button
            label="Download my data"
            variant="secondary"
            icon="download"
            loading={exporting}
            onPress={() => void exportData()}
            testID="account-export"
          />
        </SectionCard>

        <SectionCard title="Delete account">
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            Permanently delete your profile, tags, location and settings after a 7-day grace period.
            You will be asked to confirm your identity.
          </Text>
          <Button
            label="Delete my account"
            variant="danger"
            icon="delete-forever-outline"
            onPress={() => router.push('/settings/delete-account')}
            testID="account-delete"
          />
        </SectionCard>

        <Button
          label="Sign out"
          variant="ghost"
          icon="logout"
          onPress={() => void session.signOut()}
          testID="account-sign-out"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  row: { gap: 2, paddingVertical: spacing[1] },
  rowLabel: { fontWeight: fontWeight.medium },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
});
