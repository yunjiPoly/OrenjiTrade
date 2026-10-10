import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { MyLocationResponse, MyPlan } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { SwitchRow } from '@/src/components/ui/FormControls';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { WISH_ITEMS_LIMIT_KEY } from './wishForm';

/**
 * Whether wishlist alerts can reach the collector: alerts go to collectors of the lister's
 * platform region (ADR 0017), so the collector needs a country and a state or province. `unknown`
 * until `GET /me/location` answers (web: `WishlistStore.readiness`).
 */
export type AlertReadiness = 'unknown' | 'ready' | 'no-location';

export function alertReadiness(location: MyLocationResponse | null | undefined): AlertReadiness {
  if (!location) {
    return 'unknown';
  }
  return location.location ? 'ready' : 'no-location';
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

/** Without a location no wishlist alert can arrive: says so, with the fix. */
export function AlertReadinessNotice({ readiness }: { readiness: AlertReadiness }) {
  const { palette } = useTheme();
  const router = useRouter();
  if (readiness !== 'no-location') {
    return null;
  }
  return (
    <View
      testID="wishlist-location-prompt"
      accessibilityRole="summary"
      style={[styles.notice, { borderColor: palette.warning, backgroundColor: palette.surface }]}
    >
      <View style={styles.row}>
        <MaterialCommunityIcons name="map-marker-off-outline" size={22} color={palette.warning} />
        <Text style={[textStyle('md'), styles.strong, styles.grow, { color: palette.ink }]}>
          Set your country and state to get wishlist alerts
        </Text>
      </View>
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
        Alerts come from collectors of your region. Choose your country and state or province once
        and new listings of the cards you want will reach you.
      </Text>
      <Button
        label="Choose my location"
        variant="secondary"
        onPress={() => router.push('/settings/location')}
        testID="wishlist-location-action"
      />
    </View>
  );
}

/** "Let others see what you want": the `wishlistVisible` privacy setting, explained. */
export function WishlistVisibilityRow({
  visible,
  onChange,
  disabled,
  alertsPossible = true,
}: {
  visible: boolean;
  onChange: (visible: boolean) => void;
  disabled?: boolean;
  /** `false` while the collector has no location: no alert can arrive, so none is promised. */
  alertsPossible?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <View
      testID="wishlist-visibility"
      style={[styles.summary, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <SwitchRow
        label="Let others see what you want"
        help={`Collectors who own these cards can find you on your profile and offer them.${alertsPossible ? ' Your wishlist alerts work either way.' : ''}`}
        value={visible}
        onChange={onChange}
        disabled={disabled}
        testID="wishlist-visible"
      />
    </View>
  );
}

/** The wishlist at a glance: the number of wishes and the plan usage. */
export function WishlistSummary({ count, usage }: { count: number; usage: WishUsage | null }) {
  const { palette } = useTheme();
  return (
    <View
      testID="wishlist-summary"
      accessibilityLabel={`Wishlist summary: ${count} ${count === 1 ? 'wish' : 'wishes'}`}
      style={[styles.summary, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <Text
        testID="wishlist-count"
        style={[textStyle('md'), styles.strong, { color: palette.ink }]}
      >
        {count} {count === 1 ? 'wish' : 'wishes'}
      </Text>
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
});
