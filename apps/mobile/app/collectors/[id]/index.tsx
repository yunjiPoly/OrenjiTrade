import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type NativeScrollEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '@/src/account/AccountProvider';
import { useMyBlocks } from '@/src/api/hooks/blocks';
import { useCollectorProfile } from '@/src/api/hooks/collectors';
import type { CollectorProfileResponse } from '@/src/api/types';
import { useSessionNotice } from '@/src/auth/sessionNotice';
import { useSession } from '@/src/auth/session';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Button } from '@/src/components/ui/Button';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListRow } from '@/src/components/ui/Layout';
import { Skeleton, SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import {
  BlockCollectorDialog,
  useUnblockCollector,
  type BlockTarget,
} from '@/src/features/collectors/BlockCollectorDialog';
import { PROFILE_COPY } from '@/src/features/collectors/profileCopy';
import { ProfilePage } from '@/src/features/collectors/ProfilePage';
import { ProfileTopBar } from '@/src/features/collectors/ProfileTopBar';
import { useShareProfile } from '@/src/features/collectors/useShareProfile';
import { useMessageCollector } from '@/src/features/messages/useMessageCollector';
import { reportParams } from '@/src/features/reports/reportLabels';
import { motion, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Another collector's profile (owner spec 2026-10-14, section 9; mockup screens 19 and 20), and
 * yours when a link opens it: `GET /collectors/{handle}` and its sections. The top bar has back
 * and "⋯" (Share profile, Report, Block or Unblock); once the header scrolls away it shows the
 * avatar, the name and "Message". Deep links: orenjitrade://collectors/<handle> and
 * https://www.orenjitrade.com/collectors/<handle>; `?tab=ratings` (RATING_RECEIVED notifications)
 * scrolls to "Ratings & references" once it is drawn.
 *
 * Members only (signed out, or a 401: "Collector profiles are for members"); 404 covers unknown,
 * PRIVATE, suspended and deleted collectors alike ("not available"), so nothing leaks about why.
 * A block (today's rule, either way): the API answers the header and none of the listings; you see
 * a collector you blocked with Unblock, a collector who blocked you as "not available" (they are
 * not told, and neither are you). Places: the state or province, and the city only on its owner's
 * profile while shown (ADR 0017).
 */
export default function CollectorScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const signedOut = account.status === 'anonymous';
  const profile = useCollectorProfile(signedOut ? null : id);
  const blocks = useMyBlocks();
  const share = useShareProfile();
  const unblocking = useUnblockCollector();
  const { message, startingId } = useMessageCollector();
  const scroll = useRef<ScrollView>(null);
  const ratingsY = useRef<number | null>(null);
  const scrolledTo = useRef<string | null>(null);
  const actionsBottom = useRef<number>(Number.POSITIVE_INFINITY);
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // The "⋯" sheet's rows scroll at the largest text sizes (Block went below the fold): the
  // scroll bar flashes once they do not all fit, so the next row is not missed.
  const menuScroll = useRef<ScrollView>(null);
  const menuSize = useRef({ view: 0, content: 0 });
  const flashIfMenuScrolls = () => {
    const { view, content } = menuSize.current;
    if (view > 0 && content > view + 1) {
      // Once the sheet has slid in, where the flash can be seen.
      setTimeout(() => menuScroll.current?.flashScrollIndicators(), motion.base);
    }
  };
  const [blocking, setBlocking] = useState<BlockTarget | null>(null);

  const data = profile.data ?? null;
  const own = !!data && account.me?.id === data.id;
  const blockedByMe = !!data && data.isBlocked && !!blocks.data?.some((b) => b.id === data.id);
  // A block they made: as if the profile did not exist (once your own blocks are known).
  const blockedByThem = !!data && !own && data.isBlocked && !!blocks.data && !blockedByMe;
  const waitingForBlocks = !!data && data.isBlocked && !blocks.data && !blocks.error;

  const back = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/search');
    }
  };

  const jumpToRatings = () => {
    if (ratingsY.current !== null) {
      scroll.current?.scrollTo({ y: Math.max(0, ratingsY.current - 8), animated: true });
    }
  };

  const onRatingsLayout = (y: number) => {
    ratingsY.current = y;
    if (tab === 'ratings' && scrolledTo.current !== id) {
      scrolledTo.current = id ?? null;
      scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    }
  };

  const onScroll = ({ nativeEvent }: { nativeEvent: NativeScrollEvent }) => {
    const past = nativeEvent.contentOffset.y > actionsBottom.current;
    if (past !== compact) {
      setCompact(past);
    }
  };

  const startMessage = (target: CollectorProfileResponse) => void message(target.id);

  let content;
  if (signedOut || profile.error?.status === 401) {
    content = <MembersOnly />;
  } else if (profile.error?.status === 404 || blockedByThem) {
    content = <NotAvailable />;
  } else if (data && !waitingForBlocks) {
    content = (
      <ProfilePage
        profile={data}
        own={own}
        onJumpToRatings={jumpToRatings}
        onRatingsLayout={onRatingsLayout}
        onActionsLayout={(bottom) => {
          actionsBottom.current = bottom;
        }}
        onShare={() => void share(data)}
        blockedByMe={blockedByMe}
        onUnblock={() =>
          void unblocking.unblock({ id: data.id, displayName: data.handle }).then((done) => {
            if (done) {
              void profile.refetch();
            }
          })
        }
        unblocking={unblocking.pending}
      />
    );
  } else if (profile.error) {
    content = (
      <View style={styles.padded}>
        <ErrorState
          testID="collector-error"
          error={profile.error}
          title={PROFILE_COPY.loadError}
          onRetry={() => void profile.refetch()}
          retryLabel={profile.isFetching ? PROFILE_COPY.retrying : PROFILE_COPY.retry}
        />
      </View>
    );
  } else {
    content = (
      <View
        testID="collector-loading"
        accessibilityLabel={PROFILE_COPY.loading}
        aria-busy
        style={styles.padded}
      >
        <View style={styles.loadingHead}>
          <Skeleton width={64} height={64} radius={32} />
          <View style={styles.grow}>
            <Skeleton width="70%" height={24} />
            <Skeleton width="40%" height={16} />
          </View>
        </View>
        <Skeleton height={44} radius={22} style={styles.gap} />
        <SkeletonList rows={3} rowHeight={96} />
      </View>
    );
  }

  const showMenu = !!data && !own && !blockedByThem && !waitingForBlocks;
  const compactBar =
    compact && data && !own && !data.isBlocked
      ? {
          profile: data,
          onMessage: data.canMessage ? () => startMessage(data) : undefined,
          messaging: startingId === data.id,
        }
      : null;

  return (
    <View testID="screen-collector" style={[styles.fill, { backgroundColor: palette.background }]}>
      <Stack.Screen
        options={{ headerShown: false, title: data?.displayName ?? (id ? `@${id}` : 'Collector') }}
      />
      <ProfileTopBar
        topInset={insets.top}
        handle={data?.handle ?? id ?? ''}
        onBack={back}
        onMore={showMenu ? () => setMenuOpen(true) : undefined}
        compact={compactBar}
      />
      <ScrollView
        ref={scroll}
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing[4] }}
        testID="collector-scroll"
      >
        {content}
      </ScrollView>
      {data && showMenu ? (
        <BottomSheet
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          testID="collector-menu-sheet"
        >
          <ScrollView
            ref={menuScroll}
            style={styles.menuScroll}
            bounces={false}
            onLayout={(event) => {
              menuSize.current.view = event.nativeEvent.layout.height;
              flashIfMenuScrolls();
            }}
            onContentSizeChange={(_width, height) => {
              menuSize.current.content = height;
              flashIfMenuScrolls();
            }}
            testID="collector-menu-scroll"
          >
            <ListRow
              icon="export-variant"
              label={PROFILE_COPY.shareProfile}
              kind="button"
              onPress={() => {
                setMenuOpen(false);
                void share(data);
              }}
              testID="collector-share"
            />
            <ListRow
              icon="flag-outline"
              label={PROFILE_COPY.report(data.handle)}
              kind="button"
              onPress={() => {
                setMenuOpen(false);
                router.push({
                  pathname: '/report',
                  params: reportParams(data, { source: 'PROFILE' }),
                });
              }}
              testID="collector-report"
            />
            {blockedByMe ? (
              <ListRow
                icon="lock-open-variant-outline"
                label={PROFILE_COPY.unblock(data.handle)}
                kind="button"
                onPress={() => {
                  setMenuOpen(false);
                  void unblocking
                    .unblock({ id: data.id, displayName: data.handle })
                    .then((done) => (done ? void profile.refetch() : undefined));
                }}
                testID="collector-menu-unblock"
              />
            ) : (
              <ListRow
                icon="cancel"
                label={PROFILE_COPY.block(data.handle)}
                kind="button"
                tone="danger"
                onPress={() => {
                  setMenuOpen(false);
                  setBlocking({ id: data.id, displayName: data.handle });
                }}
                testID="collector-block"
              />
            )}
          </ScrollView>
          <Button
            label={PROFILE_COPY.cancel}
            variant="secondary"
            onPress={() => setMenuOpen(false)}
            style={styles.cancel}
            testID="collector-menu-cancel"
          />
        </BottomSheet>
      ) : null}
      <BlockCollectorDialog
        target={blocking}
        onClose={() => setBlocking(null)}
        onBlocked={() => void profile.refetch()}
      />
    </View>
  );
}

function MembersOnly() {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  // A 401 while signed in means the session itself ended: sign out (the gate then opens sign-in
  // and reopens this profile afterwards) instead of pushing a sign-in screen the gate would send
  // straight back to the tabs.
  const signedIn = session.status === 'authenticated';
  const go = (screen: '/sign-in' | '/sign-up') => {
    if (signedIn) {
      useSessionNotice.getState().reportEnded();
    } else {
      router.push(screen);
    }
  };
  return (
    <View
      testID="collector-members-only"
      accessibilityRole="summary"
      style={[styles.centered, styles.padded]}
    >
      <Text style={[textStyle('xl', 'heading'), styles.title, { color: palette.ink }]}>
        {PROFILE_COPY.membersTitle}
      </Text>
      <Text style={[textStyle('md'), styles.title, { color: palette.textMuted }]}>
        {PROFILE_COPY.membersBody}
      </Text>
      <Button
        label={PROFILE_COPY.signIn}
        onPress={() => go('/sign-in')}
        testID="collector-sign-in"
      />
      <Button
        label={PROFILE_COPY.createAccount}
        variant="secondary"
        onPress={() => go('/sign-up')}
        testID="collector-sign-up"
      />
    </View>
  );
}

function NotAvailable() {
  const router = useRouter();
  return (
    <View style={styles.padded}>
      <EmptyState
        testID="collector-not-found"
        icon="account-off-outline"
        title={PROFILE_COPY.notAvailableTitle}
        description={PROFILE_COPY.notAvailableBody}
        actionLabel={PROFILE_COPY.notAvailableAction}
        onAction={() => router.navigate('/search')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  padded: { paddingHorizontal: spacing[4] },
  grow: { flex: 1, gap: spacing[2] },
  gap: { marginVertical: spacing[4] },
  loadingHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    marginTop: spacing[2],
  },
  centered: { gap: spacing[3], paddingVertical: spacing[8], alignItems: 'stretch' },
  title: { textAlign: 'center' },
  menuScroll: { flexGrow: 0, flexShrink: 1 },
  cancel: { marginTop: spacing[2] },
});
