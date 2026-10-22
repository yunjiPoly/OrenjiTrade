import { StyleSheet, View } from 'react-native';

import { useMeta } from '@/src/api/hooks/meta';
import { useGames } from '@/src/api/hooks/profile';
import { Chip } from '@/src/components/ui/Chip';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { creditedGames } from '@/src/lib/cardImages';
import { relativeTime } from '@/src/lib/relativeTime';
import { useAppStore, type ThemeOverride } from '@/src/store/useAppStore';
import { fontFamily, spacing, textStyle, useTheme } from '@/src/theme';

const THEME_OPTIONS: { value: ThemeOverride; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Copy of the About card's credits row (mockup v50, screen 53). */
const CREDITS_COPY = {
  title: 'Card data and images',
  notEndorsed: 'Not affiliated with or endorsed by the game publishers.',
} as const;

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
      <View testID="card-data-credits-loading" style={styles.status}>
        <Skeleton width="45%" height={18} />
        <Skeleton width="85%" height={14} />
      </View>
    );
  }
  const credits = creditedGames(games.isError ? null : games.data);
  if (credits.length === 0) {
    return null;
  }
  const text = [...credits.map((credit) => credit.aboutLine), CREDITS_COPY.notEndorsed].join(' ');
  return (
    <View
      testID="card-data-credits"
      accessible
      accessibilityLabel={`${CREDITS_COPY.title}. ${text}`}
      style={[styles.status, styles.credits, { borderTopColor: palette.border }]}
    >
      <Text style={[textStyle('md'), { color: palette.ink }]}>{CREDITS_COPY.title}</Text>
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{text}</Text>
    </View>
  );
}

function ApiStatus() {
  const { palette } = useTheme();
  const meta = useMeta();
  if (meta.isPending) {
    return (
      <View testID="api-status-loading" style={styles.status}>
        <Skeleton width="55%" height={18} />
        <Skeleton width="35%" height={14} />
      </View>
    );
  }
  if (meta.isError) {
    return (
      <ErrorState
        compact
        error={meta.error}
        title="API unreachable"
        onRetry={() => void meta.refetch()}
        testID="api-status-error"
      />
    );
  }
  return (
    <View testID="api-status-ready" style={styles.status}>
      <Text style={[textStyle('md'), { color: palette.ink }]}>{meta.data.name}</Text>
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
        Version{' '}
        <Text style={{ fontFamily: fontFamily.mono, color: palette.ink }} testID="api-version">
          {meta.data.version}
        </Text>{' '}
        · {meta.data.environment} · server time {relativeTime(meta.data.serverTime)}
      </Text>
    </View>
  );
}

/** Settings → Appearance: theme override (stored on the device) and app information. */
export default function AppearanceSettingsScreen() {
  const themeOverride = useAppStore((state) => state.themeOverride);
  const setThemeOverride = useAppStore((state) => state.setThemeOverride);
  return (
    <Screen scroll safeBottom testID="screen-settings-appearance">
      <View style={styles.root}>
        <SectionCard title="Theme">
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Theme">
            {THEME_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={themeOverride === option.value}
                onPress={() => setThemeOverride(option.value)}
                testID={`theme-${option.value}`}
              />
            ))}
          </View>
        </SectionCard>
        <SectionCard title="About">
          <ApiStatus />
          <CardDataCredits />
        </SectionCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  // The chips wrap: at the largest text size "Dark" was pushed off the screen (found by R5).
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  status: { gap: spacing[1] },
  credits: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing[3],
    marginTop: spacing[2],
  },
});
