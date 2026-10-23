import { StyleSheet, View } from 'react-native';

import { useMeta } from '@/src/api/hooks/meta';
import { useGames } from '@/src/api/hooks/profile';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { appVersion } from '@/src/features/settings/appVersion';
import { APPEARANCE_COPY as COPY, THEME_NAMES } from '@/src/features/settings/settingsCopy';
import { SettingsGroup, SettingsRadios, SettingsRow } from '@/src/features/settings/SettingsList';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { creditedGames } from '@/src/lib/cardImages';
import { relativeTime } from '@/src/lib/relativeTime';
import { useAppStore, type ThemeOverride } from '@/src/store/useAppStore';
import { fontWeight, spacing, useTheme } from '@/src/theme';

const THEME_OPTIONS: { value: ThemeOverride; label: string }[] = [
  { value: 'system', label: THEME_NAMES.system },
  { value: 'light', label: THEME_NAMES.light },
  { value: 'dark', label: THEME_NAMES.dark },
];

/**
 * "Card data and images": the catalogue sources of the games that hold cards (Yu-Gi-Oh! from
 * YGOPRODeck; Pokémon from TCGdex and Magic from Scryfall once imported, stage R10), in the games'
 * order. While the games load, a skeleton; without them (offline), every credit.
 */
function CardDataCredits() {
  const { palette } = useTheme();
  const games = useGames();
  if (games.isPending) {
    return (
      <View testID="card-data-credits-loading" style={styles.credits}>
        <Skeleton width="45%" height={18} />
        <Skeleton width="85%" height={14} />
      </View>
    );
  }
  const credits = creditedGames(games.isError ? null : games.data);
  if (credits.length === 0) {
    return null;
  }
  const text = [...credits.map((credit) => credit.aboutLine), COPY.notEndorsed].join(' ');
  return (
    <View
      testID="card-data-credits"
      accessible
      accessibilityLabel={`${COPY.credits}. ${text}`}
      style={styles.credits}
    >
      <Text style={[styles.label, { color: palette.ink }]}>{COPY.credits}</Text>
      <Text style={[styles.detail, { color: palette.textMuted }]}>{text}</Text>
    </View>
  );
}

/** "Server": reached when `GET /meta` answered (with the API's name and version), or Try again. */
function ServerRow() {
  const meta = useMeta();
  if (meta.isPending) {
    return (
      <SettingsRow
        kind="info"
        icon="server-outline"
        label={COPY.server}
        valueLoading
        testID="api-status-loading"
      />
    );
  }
  if (meta.isError) {
    return (
      <ErrorState
        compact
        error={meta.error}
        title={COPY.serverError}
        onRetry={() => void meta.refetch()}
        testID="api-status-error"
      />
    );
  }
  return (
    <SettingsRow
      kind="info"
      icon="server-outline"
      label={COPY.server}
      detail={COPY.serverApi(meta.data.name, meta.data.version)}
      value={COPY.serverReached(relativeTime(meta.dataUpdatedAt))}
      testID="api-status-ready"
    />
  );
}

/**
 * Settings › Appearance (stage R13, mockup v50 screen 53): the theme (Same as the phone, Light,
 * Dark; kept on this phone, a new install starts in dark) and About: the app's version, whether
 * the server answered, and the card data credits.
 */
export default function AppearanceSettingsScreen() {
  const themeOverride = useAppStore((state) => state.themeOverride);
  const setThemeOverride = useAppStore((state) => state.setThemeOverride);
  const meta = useMeta();
  return (
    <SettingsPage title={COPY.title} testID="screen-settings-appearance">
      <SettingsRadios
        title={COPY.theme}
        options={THEME_OPTIONS}
        value={themeOverride}
        onChange={setThemeOverride}
        footnote={COPY.themeNote}
        testID="theme"
      />
      <SettingsGroup title={COPY.about}>
        <SettingsRow
          kind="info"
          icon="information-outline"
          label={COPY.version}
          value={COPY.versionValue(appVersion(), meta.data?.environment ?? null)}
          testID="app-version"
        />
        <ServerRow />
        <CardDataCredits />
      </SettingsGroup>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  credits: { gap: 2, paddingVertical: spacing[3], paddingHorizontal: 14 },
  label: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.medium },
  detail: { fontSize: 13, lineHeight: 18 },
});
