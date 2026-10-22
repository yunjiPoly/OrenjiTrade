import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '@/src/account/AccountProvider';
import type { ApiError } from '@/src/api/ApiError';
import {
  hideAuthor,
  ROOM_REFRESH_MS,
  useCommunityPosts,
  useCommunityRooms,
  useCreatePost,
  useDeletePost,
} from '@/src/api/hooks/community';
import { useRegionOptions } from '@/src/api/hooks/regions';
import { useUid } from '@/src/api/hooks/useUid';
import type { PostResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListRow } from '@/src/components/ui/Layout';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import {
  BlockCollectorDialog,
  type BlockTarget,
} from '@/src/features/collectors/BlockCollectorDialog';
import { ROOM_COPY, ROOM_NAMES, ROOMS_COPY } from '@/src/features/community/communityCopy';
import {
  buildRoomItems,
  isRetryable,
  postErrorMessage,
  type RoomDraft,
  type RoomItem,
} from '@/src/features/community/communityHelpers';
import { RoomComposer } from '@/src/features/community/RoomComposer';
import { RoomPost } from '@/src/features/community/RoomPost';
import { useRoomVisits } from '@/src/features/community/roomVisits';
import { GameTile } from '@/src/features/games/GameTile';
import { useMessageCollector } from '@/src/features/messages/useMessageCollector';
import { reportParams } from '@/src/features/reports/reportLabels';
import { useKeyboardOverlap } from '@/src/hooks/useKeyboardOverlap';
import { regionName } from '@/src/lib/place';
import { fontWeight, PINNED_MAX_FONT_SCALE, spacing, useTheme } from '@/src/theme';

/** The region and game of a room's slug ("americas-north-yugioh"), for a header before the list. */
function splitSlug(
  slug: string,
  regions: readonly string[]
): { region: string | null; game: string | null } {
  const region = regions.find((code) => slug.startsWith(`${code}-`)) ?? null;
  return { region, game: region ? slug.slice(region.length + 1) : null };
}

/**
 * A room (stage R11, owner prompt 2026-10-20, mockup v50 screen 33): back to Community, the game's
 * tile, its name and "{region} · public room", and "Room rules" (the rules, the posting limit, "Got
 * it"). The banner says every collector can read the room. Posts read like a chat, newest at the
 * bottom, with day separators; "⋯" on a post offers "Message {handle}" (a private chat without a
 * pinned card), "Report this post", "Block {handle}" in red, or "Delete" on one's own. The message
 * box posts text with up to 4 photos, a card, a binder or a deck core. Blocked pairs, removed
 * posts and suspended accounts never show (the API leaves them out); posts never notify. Opening
 * the room records the newest post read, so the list stops showing it as new. While the room is on
 * screen, newer posts show by themselves (asked again every 15 s, on coming back to the room, and
 * with a pull at the newest end); review fix 1: the room had lost the old screen's refresh.
 */
export default function RoomScreen() {
  const { slug: param } = useLocalSearchParams<{ slug: string }>();
  const slug = param ?? '';
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const uid = useUid();
  const selfId = useAccount().me?.id ?? null;
  const regionOptions = useRegionOptions();
  const rooms = useCommunityRooms(null);
  // On screen (not covered by a profile, a card or a binder opened from a post): the posts are
  // asked again every 15 s while the app is in the foreground.
  const [focused, setFocused] = useState(true);
  const posts = useCommunityPosts(slug, focused);
  const refetchPosts = posts.refetch;
  // When the posts were last read, for the focus below (a ref: a new page must not re-run it).
  const updatedAt = useRef(0);
  useEffect(() => {
    updatedAt.current = posts.dataUpdatedAt;
  }, [posts.dataUpdatedAt]);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      // Back in the room: what was posted meanwhile.
      if (updatedAt.current > 0 && Date.now() - updatedAt.current > ROOM_REFRESH_MS) {
        void refetchPosts();
      }
      return () => setFocused(false);
    }, [refetchPosts])
  );
  // Only a pull shows the spinner (the refreshes above stay silent).
  const [pulling, setPulling] = useState(false);
  const create = useCreatePost(slug);
  const remove = useDeletePost(slug);
  const { visit } = useRoomVisits();
  const { message } = useMessageCollector();
  const { ref: rootRef, overlap: keyboardOverlap, onLayout: onRootLayout } = useKeyboardOverlap();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [menuPost, setMenuPost] = useState<PostResponse | null>(null);
  const [deleting, setDeleting] = useState<PostResponse | null>(null);
  const [blocking, setBlocking] = useState<BlockTarget | null>(null);
  const [postError, setPostError] = useState<ApiError | null>(null);

  const room = rooms.data?.find((candidate) => candidate.slug === slug) ?? null;
  const fromSlug = splitSlug(
    slug,
    regionOptions.map((option) => option.code)
  );
  const regionCode = room?.regionLabel ?? fromSlug.region;
  const region =
    regionOptions.find((option) => option.code === regionCode)?.name ?? regionName(regionCode);
  const game = room?.game ?? fromSlug.game ?? '';
  // The room's name before the list has answered (the rooms are named after their game).
  const name = room?.name ?? ROOM_NAMES[game] ?? '';
  const all = useMemo(
    () => posts.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [posts.data]
  );
  // Inverted list: the newest item first.
  const items = useMemo(() => buildRoomItems(all).reverse(), [all]);
  const newest = all[0]?.createdAt ?? null;

  // Reading the room marks its newest post as read on this phone (the list's dot goes away).
  useEffect(() => {
    if (newest) {
      visit(slug, newest);
    }
  }, [newest, slug, visit]);

  const onPost = async (draft: RoomDraft): Promise<boolean> => {
    setPostError(null);
    try {
      await create.mutateAsync(draft);
      return true;
    } catch (error) {
      setPostError(error as ApiError);
      return false;
    }
  };

  const confirmDelete = async () => {
    if (!deleting) {
      return;
    }
    try {
      await remove.mutateAsync({ id: deleting.id });
      snackbar.show(ROOM_COPY.deleted);
    } catch (error) {
      snackbar.show(postErrorMessage(error as ApiError), { tone: 'error' });
    } finally {
      setDeleting(null);
    }
  };

  const act = (action: 'message' | 'report' | 'block' | 'delete') => {
    const post = menuPost;
    setMenuPost(null);
    if (!post) {
      return;
    }
    switch (action) {
      case 'message':
        void message(post.author.id);
        return;
      case 'report':
        router.push({
          pathname: '/report',
          params: reportParams(post.author, { source: 'POST', postId: post.id }),
        });
        return;
      case 'block':
        setBlocking({ id: post.author.id, displayName: post.author.handle });
        return;
      case 'delete':
        setDeleting(post);
        return;
    }
  };

  const disabled =
    rooms.error?.errorCode === 'FEATURE_DISABLED' || posts.error?.errorCode === 'FEATURE_DISABLED';
  const gone = !posts.data && posts.error?.status === 404 && !disabled;

  let body;
  if (disabled) {
    body = (
      <EmptyState
        testID="community-disabled"
        icon="message-off-outline"
        title={ROOMS_COPY.closedTitle}
        description={ROOMS_COPY.closedBody}
        actionLabel={ROOMS_COPY.closedAction}
        onAction={() => router.navigate({ pathname: '/messages', params: { view: 'chats' } })}
      />
    );
  } else if (gone) {
    body = (
      <EmptyState
        testID="room-not-found"
        icon="magnify-close"
        title={ROOM_COPY.notFoundTitle}
        description={ROOM_COPY.notFoundBody}
        actionLabel={ROOM_COPY.notFoundAction}
        onAction={() => router.navigate({ pathname: '/messages', params: { view: 'community' } })}
      />
    );
  } else if (!posts.data && posts.error) {
    body = (
      <ErrorState
        testID="room-error"
        error={posts.error}
        title={ROOM_COPY.loadError}
        onRetry={() => void posts.refetch()}
      />
    );
  } else if (!posts.data) {
    body = (
      <View
        style={styles.skeleton}
        testID="room-loading"
        accessibilityLabel={ROOM_COPY.loading}
        aria-busy
      >
        {[0, 1, 2].map((row) => (
          <View key={row} style={styles.skeletonRow}>
            <Skeleton width={34} height={34} radius={17} />
            <View style={styles.grow}>
              <Skeleton width="40%" height={14} />
              <Skeleton width="85%" height={36} style={styles.skeletonGap} />
            </View>
          </View>
        ))}
      </View>
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        testID="room-empty"
        icon="forum-outline"
        title={ROOM_COPY.emptyTitle}
        description={ROOM_COPY.emptyBody}
      />
    );
  } else {
    body = (
      <FlatList
        testID="room-posts"
        accessibilityLabel={ROOM_COPY.postsLabel(name)}
        inverted
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={({ item }: { item: RoomItem }) =>
          item.kind === 'day' ? (
            <View accessibilityRole="header" style={styles.day}>
              <Text style={[styles.dayText, { color: palette.textDisabled }]}>{item.label}</Text>
            </View>
          ) : (
            <RoomPost
              post={item.post}
              own={!!selfId && item.post.author.id === selfId}
              onMore={setMenuPost}
            />
          )
        }
        contentContainerStyle={styles.list}
        // Inverted: the pull happens at the newest end, at the bottom.
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={() => {
              setPulling(true);
              void posts.refetch().finally(() => setPulling(false));
            }}
          />
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onEndReached={() => {
          if (posts.hasNextPage && !posts.isFetchingNextPage && !posts.isFetchNextPageError) {
            void posts.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.3}
        // Inverted: the footer sits at the top (older pages).
        ListFooterComponent={
          posts.hasNextPage ? (
            <ListFooter
              loading={posts.isFetchingNextPage}
              failed={posts.isFetchNextPageError}
              onRetry={() => void posts.fetchNextPage()}
              testID="room-older"
            />
          ) : null
        }
      />
    );
  }

  const own = !!menuPost && !!selfId && menuPost.author.id === selfId;

  return (
    <View
      ref={rootRef}
      onLayout={onRootLayout}
      testID="screen-community-room"
      style={[styles.fill, { backgroundColor: palette.background }]}
    >
      <Stack.Screen options={{ headerShown: false, title: name || 'Community' }} />
      <View style={[styles.bar, { paddingTop: insets.top + 8, borderBottomColor: palette.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ROOM_COPY.back}
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.navigate({ pathname: '/messages', params: { view: 'community' } })
          }
          // The id of the navigation header's back button: the flows go back the same way.
          testID="BackButton"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color={palette.ink} />
        </Pressable>
        <View style={styles.title} testID="room-head">
          {game ? <GameTile slug={game} name={name} size={36} /> : null}
          <View style={styles.grow}>
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              style={[styles.name, { color: palette.ink }]}
            >
              {name}
            </Text>
            {regionCode ? (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                testID="room-subtitle"
                style={[styles.subtitle, { color: palette.textMuted }]}
              >
                {ROOM_COPY.subtitle(region)}
              </Text>
            ) : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ROOM_COPY.rulesButton}
          onPress={() => setRulesOpen(true)}
          testID="room-rules"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="information-outline" size={24} color={palette.ink} />
        </Pressable>
      </View>

      {!disabled && !gone ? (
        <View
          testID="room-banner"
          style={[styles.banner, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <MaterialCommunityIcons
            name="shield-check-outline"
            size={15}
            color={palette.accent}
            style={styles.bannerIcon}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          {/* Pinned above the posts: it follows the text size a little only, so the posts keep
              the screen at the largest sizes. */}
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.bannerText, { color: palette.textMuted }]}
          >
            {ROOM_COPY.banner}
          </Text>
        </View>
      ) : null}

      <View style={styles.fill}>{body}</View>

      {!disabled && !gone ? (
        <View
          style={[
            styles.composer,
            {
              borderTopColor: palette.border,
              backgroundColor: palette.background,
              paddingBottom: (keyboardOverlap > 0 ? keyboardOverlap : insets.bottom) + spacing[2],
            },
          ]}
        >
          <RoomComposer
            roomName={name}
            busy={create.isPending}
            disabled={!posts.data}
            error={postError ? postErrorMessage(postError) : null}
            retryable={!!postError && isRetryable(postError)}
            onPost={onPost}
            onDismissError={() => setPostError(null)}
          />
        </View>
      ) : null}

      <BottomSheet
        visible={rulesOpen}
        onClose={() => setRulesOpen(false)}
        title={ROOM_COPY.rulesTitle}
        testID="room-rules-sheet"
      >
        <ScrollView style={styles.sheetScroll} bounces={false}>
          <View style={styles.rules}>
            {ROOM_COPY.rules.map((rule) => (
              <View key={rule} style={styles.rule}>
                <Text style={[styles.ruleText, { color: palette.ink }]}>{'•'}</Text>
                <Text style={[styles.ruleText, styles.grow, { color: palette.ink }]}>{rule}</Text>
              </View>
            ))}
            <Text testID="room-rate-rule" style={[styles.rateRule, { color: palette.textMuted }]}>
              {ROOM_COPY.rateRule}
            </Text>
          </View>
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ROOM_COPY.gotIt}
          onPress={() => setRulesOpen(false)}
          testID="room-rules-ok"
          style={({ pressed }) => [
            styles.gotIt,
            { backgroundColor: palette.primary },
            pressed && styles.pressed,
          ]}
        >
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.gotItLabel, { color: palette.onPrimary }]}
          >
            {ROOM_COPY.gotIt}
          </Text>
        </Pressable>
      </BottomSheet>

      <BottomSheet
        visible={menuPost !== null}
        onClose={() => setMenuPost(null)}
        testID="room-post-sheet"
      >
        {/* The actions scroll at the largest text sizes (Block stays in reach). */}
        <ScrollView style={styles.sheetScroll} bounces={false}>
          {own ? (
            <ListRow
              icon="delete-outline"
              label={ROOM_COPY.delete}
              kind="button"
              tone="danger"
              onPress={() => act('delete')}
              testID="room-post-delete"
            />
          ) : menuPost ? (
            <>
              <ListRow
                icon="message-outline"
                label={ROOM_COPY.message(menuPost.author.handle)}
                kind="button"
                onPress={() => act('message')}
                testID="room-post-message"
              />
              <ListRow
                icon="flag-outline"
                label={ROOM_COPY.report}
                kind="button"
                onPress={() => act('report')}
                testID="room-post-report"
              />
              <ListRow
                icon="cancel"
                label={ROOM_COPY.block(menuPost.author.handle)}
                kind="button"
                tone="danger"
                onPress={() => act('block')}
                testID="room-post-block"
              />
            </>
          ) : null}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ROOM_COPY.cancel}
          onPress={() => setMenuPost(null)}
          testID="room-post-cancel"
          style={({ pressed }) => [
            styles.cancel,
            { borderColor: palette.borderStrong },
            pressed && styles.pressed,
          ]}
        >
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.cancelLabel, { color: palette.ink }]}
          >
            {ROOM_COPY.cancel}
          </Text>
        </Pressable>
      </BottomSheet>

      <ConfirmDialog
        visible={deleting !== null}
        title={ROOM_COPY.deleteTitle}
        message={ROOM_COPY.deleteBody}
        confirmLabel={ROOM_COPY.delete}
        tone="danger"
        busy={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
        testID="room-delete-dialog"
      />
      <BlockCollectorDialog
        target={blocking}
        onClose={() => setBlocking(null)}
        onBlocked={(target) => hideAuthor(queryClient, uid, target.id)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingBottom: 8,
    paddingLeft: 8,
    paddingRight: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 16, lineHeight: 21, fontWeight: fontWeight.semibold },
  subtitle: { fontSize: 12, lineHeight: 16 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    marginHorizontal: spacing[4],
    marginTop: spacing[2],
    paddingHorizontal: 12,
    paddingVertical: spacing[2],
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerIcon: { marginTop: 1 },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 17 },
  list: { paddingVertical: spacing[2] },
  day: { alignItems: 'center', paddingTop: spacing[2], paddingBottom: spacing[1] },
  dayText: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
  skeleton: { padding: spacing[4], gap: spacing[4] },
  skeletonRow: { flexDirection: 'row', gap: 10 },
  skeletonGap: { marginTop: 6 },
  composer: {
    paddingHorizontal: 12,
    paddingTop: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  rules: { gap: 10, paddingTop: spacing[1] },
  rule: { flexDirection: 'row', gap: spacing[2] },
  ruleText: { fontSize: 15, lineHeight: 22 },
  rateRule: { fontSize: 13, lineHeight: 18, marginTop: spacing[1] },
  gotIt: {
    minHeight: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[4],
  },
  gotItLabel: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.bold },
  cancel: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[2],
  },
  cancelLabel: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
});
