import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '@/src/account/AccountProvider';
import { useCollectorProfile } from '@/src/api/hooks/collectors';
import { useUid } from '@/src/api/hooks/useUid';
import { meKeys } from '@/src/api/queryKeys';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Skeleton, SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { PROFILE_COPY } from '@/src/features/collectors/profileCopy';
import { ProfilePage } from '@/src/features/collectors/ProfilePage';
import { useShareProfile } from '@/src/features/collectors/useShareProfile';
import { NotificationBell } from '@/src/features/notifications/NotificationBell';
import { fontFamily, fontWeight, spacing, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

/**
 * Your Profile tab (owner spec 2026-10-14, section 9; mockup screen 21): the title "Profile", the
 * bell and a gear that opens Settings; then the same page other collectors see of you (your public
 * cards and binders, your wishes, your bio, your ratings and references), with "Edit profile" and
 * "Share profile" instead of "Message", your wishes without "I have it", and "See all" leading to
 * your Inventory, Inventory › Binders and Search › Wishlist. Everything the tab reached before
 * stays one tap further: Settings (Location, Privacy, Shipping details, Notifications, Blocked
 * users, My reports, Account, Appearance, Legal, Sign out) behind the gear, the profile editor
 * behind "Edit profile". Coming back to the tab reads the page again (an edit made elsewhere).
 */
export default function ProfileScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const account = useAccount();
  const uid = useUid();
  const queryClient = useQueryClient();
  const handle = account.handle;
  const profile = useCollectorProfile(handle);
  const share = useShareProfile();
  const scroll = useRef<ScrollView>(null);
  const ratingsY = useRef<number | null>(null);
  const focused = useRef(false);

  // Back on the tab: what you changed elsewhere (Edit profile, Inventory, Settings) shows.
  useFocusEffect(
    useCallback(() => {
      if (focused.current && handle) {
        void queryClient.invalidateQueries({ queryKey: meKeys.collector(uid, handle) });
        void queryClient.invalidateQueries({ queryKey: meKeys.wishlistItems(uid) });
        void queryClient.invalidateQueries({ queryKey: meKeys.privacy(uid) });
      }
      focused.current = true;
    }, [handle, queryClient, uid])
  );

  let content;
  if (profile.data) {
    const data = profile.data;
    content = (
      <ProfilePage
        profile={data}
        own
        onJumpToRatings={() => {
          if (ratingsY.current !== null) {
            scroll.current?.scrollTo({ y: Math.max(0, ratingsY.current - 8), animated: true });
          }
        }}
        onRatingsLayout={(y) => {
          ratingsY.current = y;
        }}
        onShare={() => void share(data)}
      />
    );
  } else if (profile.error) {
    content = (
      <View style={styles.padded}>
        <ErrorState
          testID="profile-error"
          error={profile.error}
          title={PROFILE_COPY.ownLoadError}
          onRetry={() => void profile.refetch()}
        />
      </View>
    );
  } else {
    content = (
      <View
        testID="profile-loading"
        accessibilityLabel={PROFILE_COPY.ownLoading}
        aria-busy
        style={styles.padded}
      >
        <View style={styles.loadingHead}>
          <Skeleton width={64} height={64} radius={32} />
          <View style={styles.grow}>
            <Skeleton width="60%" height={22} />
            <Skeleton width="40%" height={14} />
          </View>
        </View>
        <Skeleton height={44} radius={22} style={styles.gap} />
        <SkeletonList rows={3} rowHeight={96} />
      </View>
    );
  }

  return (
    <View
      key={`text-size-${fontScale}`}
      testID="screen-profile"
      style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}
    >
      <View style={styles.top}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[styles.title, { color: palette.ink }]}
        >
          {PROFILE_COPY.tabTitle}
        </Text>
        <View style={styles.actions}>
          <NotificationBell testID="notification-bell-profile" variant="round" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={PROFILE_COPY.settings}
            accessibilityHint={PROFILE_COPY.settingsHint}
            onPress={() => router.push('/settings')}
            testID="profile-settings"
            style={({ pressed }) => [
              styles.round,
              { backgroundColor: palette.surface, borderColor: palette.border },
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons name="cog-outline" size={20} color={palette.ink} />
          </Pressable>
        </View>
      </View>
      <ScrollView ref={scroll} testID="profile-scroll">
        {content}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[5],
    paddingBottom: spacing[1],
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.4,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  padded: { paddingHorizontal: spacing[4] },
  grow: { flex: 1, gap: spacing[2] },
  gap: { marginVertical: spacing[4] },
  loadingHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    marginTop: spacing[2],
  },
});
