import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { messageOf } from '@/src/api/errorMessages';
import { authErrorMessage } from '@/src/auth/authErrors';
import { useSession } from '@/src/auth/session';
import { PillButton } from '@/src/components/ui/PillButton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { exportMyData } from '@/src/features/account/exportData';
import { ACCOUNT_COPY as COPY, ROLE_LABELS } from '@/src/features/settings/settingsCopy';
import {
  SettingsGroup,
  SettingsRow,
  StatusPill,
  type SettingsIcon,
} from '@/src/features/settings/SettingsList';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { formatMonthYear } from '@/src/lib/dates';
import { fontWeight, radius, spacing, useStackedRows, useTheme } from '@/src/theme';

/** A row that shows a value over what it is ("sam@example.com" over "Email"). */
function InfoRow({
  icon,
  value,
  caption,
  trailing,
  valueTestID,
}: {
  icon: SettingsIcon;
  value: string;
  caption: string;
  trailing?: ReactNode;
  valueTestID?: string;
}) {
  const { palette } = useTheme();
  const stacked = useStackedRows();
  return (
    <View
      accessible
      accessibilityLabel={`${caption}: ${value}`}
      style={[styles.info, stacked && styles.infoStacked]}
    >
      <View style={styles.lead}>
        {stacked ? null : (
          <View style={styles.iconSlot}>
            <MaterialCommunityIcons name={icon} size={20} color={palette.settings.rowIcon} />
          </View>
        )}
        <View style={styles.words}>
          <Text testID={valueTestID} style={[styles.value, { color: palette.ink }]}>
            {value}
          </Text>
          <Text style={[styles.caption, { color: palette.textMuted }]}>{caption}</Text>
        </View>
      </View>
      {trailing}
    </View>
  );
}

/**
 * Settings › Account (stage R13, mockup v50 screen 56; web: `/settings/account`): the email and
 * whether it is verified ("Resend link" while it is not), the sign-in method, member since, the
 * staff roles for staff only, "Download my data", the red Delete account card and Sign out. No
 * plan: OrenjiTrade is free for every collector (ADR 0019).
 */
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
      snackbar.show(COPY.resent, { icon: 'success' });
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
      snackbar.show(COPY.downloaded(name), { icon: 'success' });
    } catch (caught) {
      snackbar.show(messageOf(caught, COPY.downloadFailed), { tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <SettingsPage title={COPY.title} testID="screen-settings-account">
      <SettingsGroup title={COPY.signIn}>
        <InfoRow
          icon="email-outline"
          value={session.user?.email ?? '—'}
          caption={COPY.email}
          valueTestID="account-email"
          trailing={
            <StatusPill
              label={verified ? COPY.verified : COPY.notVerified}
              tone={verified ? 'done' : 'open'}
              testID="account-verified"
            />
          }
        />
        {!verified ? (
          <SettingsRow
            kind="button"
            icon="email-sync-outline"
            label={sending ? COPY.resending : COPY.resend}
            detail={COPY.resendLine}
            onPress={sending ? undefined : () => void resendVerification()}
            testID="account-resend"
          />
        ) : null}
        <InfoRow
          icon="key-outline"
          value={COPY.methods(session.hasPasswordProvider, session.hasGoogleProvider)}
          caption={COPY.method}
          valueTestID="account-sign-in-method"
        />
        {account.me ? (
          <InfoRow
            icon="calendar-outline"
            value={formatMonthYear(account.me.createdAt)}
            caption={COPY.memberSince}
            valueTestID="account-member-since"
          />
        ) : null}
      </SettingsGroup>

      {roles.length > 0 ? (
        <SettingsGroup title={COPY.staff}>
          <InfoRow
            icon="shield-account-outline"
            value={roles.join(', ')}
            caption={COPY.staffLine}
            valueTestID="account-roles"
          />
        </SettingsGroup>
      ) : null}

      <SettingsGroup title={COPY.yourData}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={exporting ? COPY.downloading : COPY.download}
          accessibilityHint={COPY.downloadLine}
          aria-busy={exporting}
          disabled={exporting}
          onPress={() => void exportData()}
          testID="account-export"
          style={({ pressed }) => [styles.info, pressed && styles.pressed]}
        >
          <View style={styles.lead}>
            <View style={styles.iconSlot}>
              {exporting ? (
                <ActivityIndicator size="small" color={palette.settings.rowIcon} />
              ) : (
                <MaterialCommunityIcons
                  name="download-outline"
                  size={20}
                  color={palette.settings.rowIcon}
                />
              )}
            </View>
            <View style={styles.words}>
              <Text style={[styles.label, { color: palette.ink }]}>
                {exporting ? COPY.downloading : COPY.download}
              </Text>
              <Text style={[styles.caption, { color: palette.textMuted }]}>
                {COPY.downloadLine}
              </Text>
            </View>
          </View>
        </Pressable>
      </SettingsGroup>

      <View
        style={[
          styles.danger,
          {
            borderColor: palette.settings.dangerCardBorder,
            backgroundColor: palette.settings.dangerCardBackground,
          },
        ]}
        testID="account-delete-card"
      >
        <Text accessibilityRole="header" style={[styles.dangerTitle, { color: palette.ink }]}>
          {COPY.deleteTitle}
        </Text>
        <Text style={[styles.caption, { color: palette.textMuted }]}>{COPY.deleteText}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.deleteButton}
          onPress={() => router.push('/settings/delete-account')}
          testID="account-delete"
          style={({ pressed }) => [
            styles.deleteButton,
            { borderColor: palette.danger },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.deleteText, { color: palette.danger }]}>{COPY.deleteButton}</Text>
        </Pressable>
      </View>

      <PillButton
        label={COPY.signOut}
        variant="outline"
        icon="logout"
        onPress={() => void session.signOut()}
        testID="account-sign-out"
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 54,
    paddingVertical: spacing[2],
    paddingHorizontal: 14,
  },
  infoStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  lead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  iconSlot: { width: 22, alignItems: 'center' },
  words: { flex: 1, minWidth: 0, gap: 2 },
  value: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.medium },
  label: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.medium },
  caption: { fontSize: 13, lineHeight: 18 },
  danger: { borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: spacing[2] },
  dangerTitle: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  deleteButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
    borderRadius: 20,
    borderWidth: 1,
    marginTop: spacing[1],
  },
  deleteText: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.bold },
  pressed: { opacity: 0.7 },
});
