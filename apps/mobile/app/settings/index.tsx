import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useFeatureFlags } from '@/src/api/hooks/featureFlags';
import { useSession } from '@/src/auth/session';
import { Avatar } from '@/src/components/ui/Avatar';
import { Divider, ListRow, SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { SETTINGS_LINKS } from '@/src/features/settings/settingsLinks';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/** Settings home: identity header, the sections, sign out. */
export default function SettingsScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  const account = useAccount();
  const flags = useFeatureFlags();
  // Sections of a feature that is switched off are hidden (and while the flags are unknown).
  const links = SETTINGS_LINKS.filter(
    (link) => !link.feature || flags.data?.[link.feature] === true
  );

  return (
    <Screen scroll testID="screen-settings">
      <View style={styles.header}>
        <Avatar src={account.me?.avatarUrl} name={account.displayName} size={56} />
        <View style={styles.grow}>
          <Text style={[textStyle('lg', 'heading'), styles.name, { color: palette.ink }]}>
            {account.displayName}
          </Text>
          {account.handle ? (
            <Text style={[textStyle('sm'), { color: palette.textMuted }]}>@{account.handle}</Text>
          ) : null}
        </View>
      </View>
      <SectionCard>
        {links.map((link, index) => (
          <View key={link.label}>
            {index > 0 ? <Divider /> : null}
            <ListRow
              icon={link.icon}
              label={link.label}
              detail={link.detail}
              onPress={() => router.push(link.href)}
              testID={`settings-link-${link.label.split(' ')[0]?.toLowerCase() ?? index}`}
            />
          </View>
        ))}
      </SectionCard>
      <SectionCard style={styles.signOut}>
        <ListRow
          icon="logout"
          label="Sign out"
          kind="button"
          tone="danger"
          onPress={() => void session.signOut()}
          testID="settings-sign-out"
        />
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[4] },
  grow: { flex: 1 },
  name: { fontWeight: fontWeight.semibold },
  signOut: { marginTop: spacing[4] },
});
