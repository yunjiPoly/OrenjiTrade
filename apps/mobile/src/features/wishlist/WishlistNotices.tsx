import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { MyLocationResponse, MyPlan, WishlistItemResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import type { IconName } from '@/src/components/ui/EmptyState';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { WISH_ITEMS_LIMIT_KEY } from './wishForm';

/**
 * Whether the collector can get matches: the matcher pairs wishes with listings of collectors in
 * the same platform region (ADR 0017), so the collector needs a location. `unknown` until
 * `GET /me/location` answers (web: `matchReadiness`).
 */
export type MatchReadiness = 'unknown' | 'ready' | 'no-location';

export function matchReadiness(location: MyLocationResponse | null | undefined): MatchReadiness {
  if (!location) {
    return 'unknown';
  }
  return location.location ? 'ready' : 'no-location';
}

export type WishFilter = 'all' | 'matches' | 'paused';

/** Wishes shown by a filter: all, those with matches in the region, or the paused ones. */
export function filterWishes(
  items: readonly WishlistItemResponse[],
  filter: WishFilter
): WishlistItemResponse[] {
  switch (filter) {
    case 'matches':
      return items.filter((item) => item.matchCount > 0);
    case 'paused':
      return items.filter((item) => !item.active);
    default:
      return [...items];
  }
}

/** The plan's `wishlist.items.max` for the usage line (`limit: null` = unlimited). */
export interface WishUsage {
  used: number;
  limit: number | null;
  planName: string | null;
}

export function wishUsage(plan: MyPlan | undefined): WishUsage | null {
  const status = plan?.limits?.find((entry) => entry.key === WISH_ITEMS_LIMIT_KEY);
  return status
    ? { used: status.used ?? 0, limit: status.limit ?? null, planName: plan?.plan?.name ?? null }
    : null;
}

const HINTS: Partial<
  Record<
    MatchReadiness,
    { icon: IconName; title: string; text: string; action: string; link: string }
  >
> = {
  'no-location': {
    icon: 'map-marker-off-outline',
    title: 'Choose your location to get matches',
    text: 'Matches are listings of collectors in your region. Pick your country and state or province once and new listings of your region will reach you.',
    action: 'Choose my location',
    link: '/settings/location',
  },
};

/** Why no match can arrive yet (no location), with the fix. */
export function MatchReadinessNotice({ readiness }: { readiness: MatchReadiness }) {
  const { palette } = useTheme();
  const router = useRouter();
  const hint = HINTS[readiness];
  if (!hint) {
    return null;
  }
  return (
    <View
      testID="match-readiness"
      accessibilityRole="summary"
      style={[styles.notice, { borderColor: palette.warning, backgroundColor: palette.surface }]}
    >
      <View style={styles.row}>
        <MaterialCommunityIcons name={hint.icon} size={22} color={palette.warning} />
        <Text style={[textStyle('md'), styles.strong, styles.grow, { color: palette.ink }]}>
          {hint.title}
        </Text>
      </View>
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{hint.text}</Text>
      <Button
        label={hint.action}
        variant="secondary"
        onPress={() => router.push(hint.link as '/settings/location')}
        testID="match-readiness-action"
      />
    </View>
  );
}

/** The wishlist at a glance: wishes, wishes with matches, matches in total, plan usage. */
export function WishlistSummary({
  count,
  matched,
  totalMatches,
  usage,
}: {
  count: number;
  matched: number;
  totalMatches: number;
  usage: WishUsage | null;
}) {
  const { palette } = useTheme();
  const stats = [
    { label: 'Wishes', value: count, testID: 'wishlist-count' },
    { label: 'With matches', value: matched, testID: 'wishlist-matched' },
    { label: 'Matches', value: totalMatches, testID: 'wishlist-total-matches' },
  ];
  return (
    <View
      testID="wishlist-summary"
      accessibilityLabel="Wishlist summary"
      style={[styles.summary, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <View style={styles.stats}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={styles.stat}
            accessibilityLabel={`${stat.label}: ${stat.value}`}
          >
            <Text
              testID={stat.testID}
              style={[textStyle('xl', 'heading'), styles.strong, { color: palette.ink }]}
            >
              {stat.value}
            </Text>
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{stat.label}</Text>
          </View>
        ))}
      </View>
      {usage ? (
        <Text testID="wishlist-usage" style={[textStyle('xs'), { color: palette.textMuted }]}>
          {usage.limit !== null
            ? `${usage.used} of ${usage.limit} wishes`
            : `${usage.used} wishes · unlimited`}
          {usage.planName ? ` · ${usage.planName} plan` : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { gap: spacing[2], padding: spacing[3], borderRadius: radius.lg, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  summary: { gap: spacing[2], padding: spacing[3], borderRadius: radius.lg, borderWidth: 1 },
  stats: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2 },
});
