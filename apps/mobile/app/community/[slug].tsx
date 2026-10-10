import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useBlockUser } from '@/src/api/hooks/blocks';
import {
  hideAuthor,
  useCommunityChannels,
  useCommunityPosts,
  useCreatePost,
  useDeletePost,
} from '@/src/api/hooks/community';
import { useUid } from '@/src/api/hooks/useUid';
import type { CommunityChannel, CreatePostRequest, PostResponse } from '@/src/api/types';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import {
  activityLabel,
  channelIcon,
  channelRegionName,
  postErrorMessage,
} from '@/src/features/community/communityHelpers';
import { PostComposer } from '@/src/features/community/PostComposer';
import { PostItem } from '@/src/features/community/PostItem';
import { gameLabel } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

function ChannelHeader({ channel }: { channel: CommunityChannel }) {
  const { palette } = useTheme();
  return (
    <View style={styles.channelHead} testID="channel-head">
      <View style={[styles.channelIcon, { backgroundColor: palette.accentContainer }]}>
        <MaterialCommunityIcons
          name={channelIcon(channel.kind)}
          size={24}
          color={palette.onAccentContainer}
        />
      </View>
      <View style={styles.grow}>
        <Text
          accessibilityRole="header"
          style={[textStyle('xl', 'heading'), styles.strong, { color: palette.ink }]}
        >
          {channel.name}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{channel.description}</Text>
        <Text testID="channel-activity" style={[textStyle('xs'), { color: palette.textMuted }]}>
          {[
            channel.game ? gameLabel(channel.game) : null,
            channelRegionName(channel.regionLabel),
            activityLabel(channel.postCount24h),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
    </View>
  );
}

/**
 * One community channel (the web's `/community/:slug`): its header with the activity of the last
 * 24 hours, the post composer (text, card and binder links), and the feed, newest first, with
 * inline replies, editing and deleting own posts, and blocking an author. Refusals (per-channel
 * rate limit, duplicate, moderation) are explained under the composer.
 */
export default function CommunityChannelScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const channelSlug = slug ?? '';
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const uid = useUid();
  const account = useAccount();
  const selfId = account.me?.id ?? null;
  const channels = useCommunityChannels();
  const posts = useCommunityPosts(slug);
  const create = useCreatePost(channelSlug);
  const remove = useDeletePost(channelSlug);
  const block = useBlockUser();
  const [postError, setPostError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PostResponse | null>(null);
  const [blocking, setBlocking] = useState<PostResponse | null>(null);
  const channel = channels.data?.find((candidate) => candidate.slug === slug) ?? null;
  const items = useMemo(
    () => posts.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [posts.data]
  );

  const onPost = async (request: CreatePostRequest): Promise<boolean> => {
    setPostError(null);
    try {
      await create.mutateAsync(request);
      snackbar.show('Posted.');
      return true;
    } catch (error) {
      setPostError(postErrorMessage(error as ApiError));
      return false;
    }
  };

  const confirmDelete = async () => {
    if (!deleting) {
      return;
    }
    try {
      await remove.mutateAsync({ id: deleting.id });
      snackbar.show('Post deleted.');
    } catch (error) {
      snackbar.show(postErrorMessage(error as ApiError), { tone: 'error' });
    } finally {
      setDeleting(null);
    }
  };

  const confirmBlock = async () => {
    if (!blocking) {
      return;
    }
    const author = blocking.author;
    try {
      await block.mutateAsync({ id: author.id });
      hideAuthor(queryClient, uid, channelSlug, author.id);
      snackbar.show(`${author.displayName} is blocked.`);
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    } finally {
      setBlocking(null);
    }
  };

  const disabled =
    channels.error?.errorCode === 'FEATURE_DISABLED' ||
    posts.error?.errorCode === 'FEATURE_DISABLED';

  let content;
  if (disabled) {
    content = (
      <EmptyState
        testID="community-disabled"
        icon="message-off-outline"
        title="The community is closed right now"
        description="Public channels are turned off for the moment. Private messages still work."
        actionLabel="Open messages"
        onAction={() => router.navigate('/messages')}
      />
    );
  } else if (!posts.data && posts.error?.status === 404) {
    content = (
      <EmptyState
        testID="channel-not-found"
        icon="magnify-close"
        title="This channel does not exist"
        description="It may have been archived. Pick another channel from the list."
        actionLabel="All channels"
        onAction={() => router.navigate({ pathname: '/messages', params: { view: 'community' } })}
      />
    );
  } else if (!posts.data && posts.error) {
    content = (
      <ErrorState
        testID="channel-error"
        error={posts.error}
        title="Posts could not load"
        onRetry={() => void posts.refetch()}
      />
    );
  } else {
    content = (
      <FlatList
        testID="channel-feed"
        data={posts.data ? items : []}
        keyExtractor={(post) => post.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.feed}
        refreshControl={
          <RefreshControl
            refreshing={posts.isRefetching && !posts.isFetchingNextPage}
            onRefresh={() => {
              void posts.refetch();
              void channels.refetch();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {channel ? <ChannelHeader channel={channel} /> : null}
            <PostComposer
              channelName={channel?.name ?? 'this channel'}
              displayName={account.displayName}
              avatarUrl={account.me?.avatarUrl}
              busy={create.isPending}
              error={postError}
              onPost={onPost}
            />
            {!posts.data ? (
              <SkeletonList rows={3} rowHeight={120} testID="channel-loading" />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <PostItem
            post={item}
            slug={channelSlug}
            selfId={selfId}
            onDelete={setDeleting}
            onBlockAuthor={setBlocking}
          />
        )}
        onEndReached={() => {
          if (posts.hasNextPage && !posts.isFetchingNextPage && !posts.isFetchNextPageError) {
            void posts.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          posts.data ? (
            <EmptyState
              testID="channel-empty"
              icon="message-plus-outline"
              title="No posts yet"
              description="Be the first to post in this channel: what you are looking for, what you just listed, or a trade you want to make."
            />
          ) : null
        }
        ListFooterComponent={
          posts.data && items.length > 0 ? (
            posts.hasNextPage ? (
              <ListFooter
                loading={posts.isFetchingNextPage}
                failed={posts.isFetchNextPageError}
                onRetry={() => void posts.fetchNextPage()}
                testID="channel-more"
              />
            ) : (
              <Text style={[textStyle('sm'), styles.end, { color: palette.textMuted }]}>
                You are all caught up.
              </Text>
            )
          ) : null
        }
      />
    );
  }

  return (
    <KeyboardAvoidingView
      testID="screen-community-channel"
      style={[styles.fill, { backgroundColor: palette.background }]}
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
    >
      <Stack.Screen options={{ title: channel?.name ?? 'Community' }} />
      {content}
      <ConfirmDialog
        visible={!!deleting}
        title="Delete this post?"
        message="The post and its replies disappear from the channel."
        confirmLabel="Delete"
        tone="danger"
        busy={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
        testID="post-delete-dialog"
      />
      <ConfirmDialog
        visible={!!blocking}
        title={`Block ${blocking?.author.displayName ?? 'this collector'}?`}
        message="You will stop seeing each other’s binders, profiles and posts on the map, in search and in the community, and neither of you can send messages. They are not told."
        confirmLabel="Block"
        tone="danger"
        busy={block.isPending}
        onConfirm={() => void confirmBlock()}
        onCancel={() => setBlocking(null)}
        testID="block-dialog"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  // flexGrow: the empty state fills (and centres in) the rest of the screen.
  feed: { padding: spacing[4], gap: spacing[3], flexGrow: 1 },
  header: { gap: spacing[4], marginBottom: spacing[1] },
  channelHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  channelIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  end: { textAlign: 'center', paddingVertical: spacing[4] },
});
