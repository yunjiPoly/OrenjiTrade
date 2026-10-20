import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Switch, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useMyLimits } from '@/src/api/hooks/limits';
import { useMyLocation } from '@/src/api/hooks/location';
import {
  useNotificationSettings,
  useSaveNotificationSettings,
} from '@/src/api/hooks/notifications';
import { useWishlistAvailability } from '@/src/api/hooks/search';
import { useWishlist } from '@/src/api/hooks/wishlist';
import type { WishlistItemResponse } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { SWITCH_THUMB } from '@/src/components/ui/FormControls';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { useBrowsingGame } from '@/src/features/games/browsingGame';
import {
  AlertReadinessNotice,
  alertReadiness,
  wishUsage,
} from '@/src/features/wishlist/WishlistNotices';
import { nearCapNotice, wishCardParams, wishTerms } from '@/src/features/wishlist/wishlistLabels';
import {
  PINNED_MAX_FONT_SCALE,
  fontWeight,
  radius,
  spacing,
  textStyle,
  useStackedRows,
  useTheme,
} from '@/src/theme';

import { WISHLIST_COPY } from './searchCopy';

/**
 * Search › Wishlist (owner spec 2026-10-14, section 8, mockup screen 15; the old Wishlist tab):
 * the switch "Tell me when someone in my region lists one" (the account-wide wishlist alert of
 * stage S2, the same setting as Settings › Notifications), "Add a wish" (the card search, then the
 * S2 wish form), and the wishes: picture, name, the terms ("Any printing · NM only · 100% TCG"),
 * and on the right "Available" when at least one public holder of the browsed region has a copy
 * that fits (it opens Who has this card on that printing) or "None yet". A row edits the wish. No
 * counts; a usage line only near the cap. "Let others see what you want" is in Settings › Privacy.
 * Only the browsed game's wishes show (stage G); with wishes of other games only, the empty state
 * names the game.
 */
export function WishlistSegment() {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const wishlist = useWishlist();
  const availability = useWishlistAvailability();
  const location = useMyLocation();
  const limits = useMyLimits();
  // From the larger text sizes on, the sentence takes the row's whole width under the bell and
  // the switch: beside them it broke "someone" in the middle at the largest size.
  const stacked = useStackedRows();
  const settings = useNotificationSettings();
  const saveSettings = useSaveNotificationSettings();
  // The browsed game's wishes only (stage G); the others show when the collector switches game.
  const browsing = useBrowsingGame();
  const items = useMemo(
    () => (wishlist.data ?? []).filter((wish) => wish.game === browsing.game),
    [wishlist.data, browsing.game]
  );
  const otherGames = (wishlist.data?.length ?? 0) > 0;
  const available = useMemo(() => new Set(availability.data?.available ?? []), [availability.data]);
  const notice = nearCapNotice(wishUsage(limits.data));

  const setAlerts = async (on: boolean) => {
    if (!settings.data) {
      return;
    }
    try {
      await saveSettings.mutateAsync({ ...settings.data, wishlistAlerts: on });
      snackbar.show(on ? WISHLIST_COPY.alertsOn : WISHLIST_COPY.alertsOff);
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error', duration: 6000 });
    }
  };
  const alertsOn = !!settings.data?.wishlistAlerts;
  const add = () => router.push('/wishlist/new');

  const alertsSwitch = (
    <Switch
      accessibilityLabel={WISHLIST_COPY.alertsLabel}
      accessibilityHint={WISHLIST_COPY.alerts}
      value={alertsOn}
      onValueChange={(on) => void setAlerts(on)}
      disabled={!settings.data || saveSettings.isPending}
      trackColor={{ true: palette.primary, false: palette.borderStrong }}
      thumbColor={SWITCH_THUMB}
      style={stacked ? styles.switchStacked : undefined}
      testID="wishlist-alerts-switch"
    />
  );
  const head = (
    <View style={styles.head}>
      <View
        style={[
          styles.switchRow,
          stacked && styles.switchRowStacked,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
        testID="wishlist-alerts-row"
      >
        <MaterialCommunityIcons name="bell-outline" size={20} color={palette.primary} />
        {stacked ? alertsSwitch : null}
        <Text
          style={[
            textStyle('md'),
            stacked ? styles.alertsStacked : styles.grow,
            { color: palette.ink },
          ]}
          testID="wishlist-alerts-text"
        >
          {WISHLIST_COPY.alerts}
        </Text>
        {stacked ? null : alertsSwitch}
      </View>
      <AlertReadinessNotice readiness={alertReadiness(location.data)} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={WISHLIST_COPY.addWish}
        onPress={add}
        testID="wishlist-add"
        style={({ pressed }) => [
          styles.add,
          { borderColor: palette.primary },
          pressed && styles.pressed,
        ]}
      >
        <MaterialCommunityIcons name="plus" size={20} color={palette.primary} />
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[textStyle('md'), styles.bold, { color: palette.primary }]}
        >
          {WISHLIST_COPY.addWish}
        </Text>
      </Pressable>
      {notice ? (
        <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="wishlist-usage">
          {notice}
        </Text>
      ) : null}
    </View>
  );

  let empty;
  if (!wishlist.data && wishlist.error) {
    empty = (
      <ErrorState
        testID="wishlist-error"
        error={wishlist.error}
        title={WISHLIST_COPY.error}
        onRetry={() => void wishlist.refetch()}
      />
    );
  } else if (!wishlist.data) {
    empty = <SkeletonList rows={4} rowHeight={84} testID="wishlist-loading" />;
  } else {
    empty = (
      <EmptyState
        testID="wishlist-empty"
        icon="heart-outline"
        title={otherGames ? WISHLIST_COPY.emptyGame(browsing.current.name) : WISHLIST_COPY.empty}
        description={
          otherGames ? WISHLIST_COPY.emptyGameHint(browsing.current.name) : WISHLIST_COPY.emptyHint
        }
      />
    );
  }

  return (
    <FlatList
      testID="search-wishlist"
      accessibilityLabel="Your wishlist"
      data={wishlist.data ? items : []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={head}
      ListEmptyComponent={empty}
      renderItem={({ item }) => (
        <WishRow
          item={item}
          available={availability.data ? available.has(item.id) : null}
          onEdit={() => router.push({ pathname: '/wishlist/edit', params: { id: item.id } })}
          onOpenCard={() => {
            const params = wishCardParams(item);
            if (params) {
              router.push({ pathname: '/cards/[id]', params });
            }
          }}
        />
      )}
      refreshControl={
        <RefreshControl
          refreshing={wishlist.isRefetching}
          onRefresh={() => {
            void wishlist.refetch();
            void availability.refetch();
            void settings.refetch();
            void limits.refetch();
          }}
        />
      }
      contentContainerStyle={styles.list}
    />
  );
}

/** One wish: picture, name, terms, "Available" or "None yet" (nothing while it is asked). */
const WishRow = memo(function WishRow({
  item,
  available,
  onEdit,
  onOpenCard,
}: {
  item: WishlistItemResponse;
  available: boolean | null;
  onEdit: () => void;
  onOpenCard: () => void;
}) {
  const { palette } = useTheme();
  const stacked = useStackedRows();
  const name = item.card?.name ?? 'Card';
  const terms = wishTerms(item);
  return (
    <View
      style={[
        styles.row,
        stacked && styles.rowStacked,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
      testID={`wish-${item.id}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${terms}`}
        accessibilityHint="Edits this wish"
        onPress={onEdit}
        testID={`wish-${item.id}-edit`}
        style={({ pressed }) => [
          styles.rowMain,
          stacked && styles.rowMainStacked,
          pressed && styles.pressed,
        ]}
      >
        <CardImage src={item.card?.imageUrl} alt="" game={item.game} size="xs" />
        <View style={styles.grow}>
          <Text style={[textStyle('md'), styles.bold, { color: palette.ink }]}>{name}</Text>
          <Text
            style={[textStyle('sm'), { color: palette.textMuted }]}
            testID={`wish-${item.id}-terms`}
          >
            {terms}
          </Text>
        </View>
      </Pressable>
      {available === true ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={WISHLIST_COPY.availableLabel}
          onPress={onOpenCard}
          hitSlop={8}
          testID={`wish-${item.id}-available`}
          style={({ pressed }) => [
            styles.status,
            stacked && styles.statusStacked,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[textStyle('sm'), styles.bold, { color: palette.accent }]}>
            {WISHLIST_COPY.available}
          </Text>
        </Pressable>
      ) : available === false ? (
        <View
          style={[styles.status, stacked && styles.statusStacked]}
          testID={`wish-${item.id}-none`}
        >
          <Text style={[textStyle('sm'), styles.bold, { color: palette.textMuted }]}>
            {WISHLIST_COPY.none}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  list: { flexGrow: 1, gap: spacing[3], paddingBottom: spacing[6] },
  head: { gap: spacing[3], marginBottom: spacing[1] },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 56,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  // Bell and switch on the first line (the switch at the right end), the sentence under them.
  switchRowStacked: { flexWrap: 'wrap', alignItems: 'flex-start' },
  switchStacked: { marginLeft: 'auto' },
  alertsStacked: { width: '100%' },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingRight: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    minHeight: 72,
  },
  status: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  // Large text: "Available" or "None yet" under the card instead of beside it.
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 0, paddingRight: 0 },
  rowMainStacked: { flex: 0, paddingBottom: 0 },
  statusStacked: { alignItems: 'flex-start', paddingHorizontal: spacing[3] },
  grow: { flex: 1 },
  bold: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.75 },
});
