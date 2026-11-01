import { useRouter } from 'expo-router';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/ui/Text';
import { SettingsGroup, SettingsRow } from '@/src/features/settings/SettingsList';
import { THEME_NAMES } from '@/src/features/settings/settingsCopy';
import { useAppStore } from '@/src/store/useAppStore';
import { TITLE_MAX_FONT_SCALE, fontFamily, fontWeight, spacing, useTheme } from '@/src/theme';

import { GUEST_COPY } from './guestCopy';
import { GuestPage, type GuestPageKind } from './GuestParts';

/**
 * Inventory (73), Messages (74) and Profile (75) for a guest (stage R15): they stay in the tab
 * bar, and each shows its title and a page in place that asks to create an account or sign in.
 * Profile also lists what a guest may open: Appearance, Trading safely and Legal.
 */
export function GuestTab({
  kind,
  title,
}: {
  kind: Exclude<GuestPageKind, 'wishlist'>;
  title: string;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return (
    <View
      key={`text-size-${fontScale}`}
      testID={`screen-${kind}-guest`}
      style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}
    >
      <View style={styles.top}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[styles.title, { color: palette.ink }]}
        >
          {title}
        </Text>
      </View>
      <GuestPage
        kind={kind}
        testID={`guest-${kind}`}
        after={kind === 'profile' ? <GuestProfileRows /> : null}
      />
    </View>
  );
}

/** Profile's rows for a guest: Appearance with its value, Trading safely, Legal. */
function GuestProfileRows() {
  const router = useRouter();
  const theme = useAppStore((state) => state.themeOverride);
  const rows = GUEST_COPY.profileRows;
  return (
    <SettingsGroup testID="guest-profile-rows">
      <SettingsRow
        icon="weather-night"
        label={rows.appearance}
        value={THEME_NAMES[theme]}
        onPress={() => router.push('/settings/appearance')}
        testID="guest-profile-appearance"
      />
      <SettingsRow
        icon="shield-outline"
        label={rows.tradingSafely}
        onPress={() => router.push({ pathname: '/legal/[key]', params: { key: 'trading-safely' } })}
        testID="guest-profile-trading-safely"
      />
      <SettingsRow
        icon="file-document-outline"
        label={rows.legal}
        detail={rows.legalDetail}
        onPress={() => router.push('/legal')}
        testID="guest-profile-legal"
      />
    </SettingsGroup>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { paddingHorizontal: spacing[4], paddingTop: 20, paddingBottom: spacing[1] },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.4,
  },
});
