import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useMyBlocks } from '@/src/api/hooks/blocks';
import { useMyLocation, usePrivacySettings } from '@/src/api/hooks/location';
import { useMyReports } from '@/src/api/hooks/reports';
import { useSession } from '@/src/auth/session';
import { Avatar } from '@/src/components/ui/Avatar';
import { Text } from '@/src/components/ui/Text';
import { isOpenReport } from '@/src/features/reports/reportLabels';
import { appVersion } from '@/src/features/settings/appVersion';
import { mapStatus } from '@/src/features/settings/mapStatus';
import { SETTINGS_HOME_COPY as COPY, THEME_NAMES } from '@/src/features/settings/settingsCopy';
import { SettingsGroup, SettingsRow } from '@/src/features/settings/SettingsList';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { useAppStore } from '@/src/store/useAppStore';
import { fontWeight, radius, useStackedRows, useTheme } from '@/src/theme';

/**
 * Settings (stage R13, mockup v50 screen 47), behind the Profile tab's gear: the profile card that
 * opens Edit profile; "Where you ship from" (the place and whether the collector is on the map,
 * Shipping details), "App" (Notifications, Privacy, Appearance and its value), "Safety" (Blocked
 * collectors with their count, My reports with those waiting), "Account" (the email, Legal); the
 * red Sign out; the version. A value that is still loading shows a short skeleton; one that could
 * not load is left out (its page says why and offers Try again).
 */
export default function SettingsScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  const account = useAccount();
  const location = useMyLocation();
  // A PRIVATE profile is off the map whatever the switch says (review fix 1).
  const privacy = usePrivacySettings();
  const blocks = useMyBlocks();
  const reports = useMyReports();
  const theme = useAppStore((state) => state.themeOverride);
  // At the largest text sizes the picture goes above the name, which then has the card's width.
  const stacked = useStackedRows();

  const place = location.data?.location?.label ?? null;
  const placeLine =
    location.data && privacy.data
      ? COPY.locationLine(
          place,
          mapStatus(!!place, {
            discoverable: location.data.discoverable,
            profileVisibility: privacy.data.profileVisibility,
          }) === 'on-map'
        )
      : null;
  const waiting = reports.data?.filter((report) => isOpenReport(report.status)).length ?? 0;
  const open = (href: Href) => () => router.push(href);

  return (
    <SettingsPage title={COPY.title} testID="screen-settings">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={COPY.profileCardLabel(account.displayName, account.handle)}
        onPress={open('/settings/profile')}
        testID="settings-link-profile"
        style={({ pressed }) => [
          styles.card,
          stacked && styles.cardStacked,
          { backgroundColor: palette.surface, borderColor: palette.border },
          pressed && styles.pressed,
        ]}
      >
        <Avatar src={account.me?.avatarUrl} name={account.displayName} size={48} />
        <View style={styles.words}>
          <Text style={[styles.name, { color: palette.ink }]} testID="settings-profile-name">
            {account.displayName}
          </Text>
          <Text style={[styles.line, { color: palette.textMuted }]}>
            {COPY.profileCardLine(account.handle)}
          </Text>
        </View>
        {stacked ? null : (
          <MaterialCommunityIcons name="chevron-right" size={18} color={palette.settings.chevron} />
        )}
      </Pressable>

      <SettingsGroup title={COPY.shipFrom}>
        <SettingsRow
          icon="map-marker-outline"
          label={COPY.location}
          detail={placeLine}
          valueLoading={location.isPending || privacy.isPending}
          onPress={open('/settings/location')}
          testID="settings-link-location"
        />
        <SettingsRow
          icon="truck-outline"
          label={COPY.shipping}
          detail={COPY.shippingLine}
          onPress={open('/settings/shipping')}
          testID="settings-link-shipping"
        />
      </SettingsGroup>

      <SettingsGroup title={COPY.app}>
        <SettingsRow
          icon="bell-outline"
          label={COPY.notifications}
          detail={COPY.notificationsLine}
          onPress={open('/settings/notifications')}
          testID="settings-link-notifications"
        />
        <SettingsRow
          icon="eye-outline"
          label={COPY.privacy}
          detail={COPY.privacyLine}
          onPress={open('/settings/privacy')}
          testID="settings-link-privacy"
        />
        <SettingsRow
          icon="weather-night"
          label={COPY.appearance}
          value={THEME_NAMES[theme]}
          onPress={open('/settings/appearance')}
          testID="settings-link-appearance"
        />
      </SettingsGroup>

      <SettingsGroup title={COPY.safety}>
        <SettingsRow
          icon="cancel"
          label={COPY.blocked}
          value={blocks.data ? String(blocks.data.length) : null}
          valueLoading={blocks.isPending}
          onPress={open('/settings/blocked')}
          testID="settings-link-blocked"
        />
        <SettingsRow
          icon="flag-outline"
          label={COPY.reports}
          value={waiting > 0 ? COPY.reportsWaiting(waiting) : null}
          valueLoading={reports.isPending}
          onPress={open('/settings/reports')}
          testID="settings-link-reports"
        />
      </SettingsGroup>

      <SettingsGroup title={COPY.account}>
        <SettingsRow
          icon="account-outline"
          label={COPY.account}
          detail={session.user?.email ?? null}
          onPress={open('/settings/account')}
          testID="settings-link-account"
        />
        <SettingsRow
          icon="file-document-outline"
          label={COPY.legal}
          detail={COPY.legalLine}
          onPress={open('/legal')}
          testID="settings-link-legal"
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          icon="logout"
          label={COPY.signOut}
          kind="button"
          tone="danger"
          onPress={() => void session.signOut()}
          testID="settings-sign-out"
        />
      </SettingsGroup>
      <Text style={[styles.version, { color: palette.settings.chevron }]} testID="settings-version">
        {COPY.version(appVersion())}
      </Text>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  cardStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  words: { flex: 1, minWidth: 0, gap: 2, alignSelf: 'stretch' },
  name: { fontSize: 16, lineHeight: 21, fontWeight: fontWeight.semibold },
  line: { fontSize: 13, lineHeight: 18 },
  version: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
