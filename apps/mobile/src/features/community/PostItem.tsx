import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import {
  useCommunityReplies,
  useCreateReply,
  useDeleteReply,
  useUpdatePost,
} from '@/src/api/hooks/community';
import type { PostResponse, ReplyResponse } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Button } from '@/src/components/ui/Button';
import { ListRow } from '@/src/components/ui/Layout';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { TextField } from '@/src/components/ui/TextField';
import { SharedLinkCard } from '@/src/features/messages/LinkCards';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { POST_MAX_LENGTH, REPLY_MAX_LENGTH, postErrorMessage } from './communityHelpers';

export interface PostItemProps {
  post: PostResponse;
  slug: string;
  selfId: string | null;
  /** Asks the screen to confirm deleting this own post. */
  onDelete: (post: PostResponse) => void;
  /** Asks the screen to confirm blocking the author. */
  onBlockAuthor: (post: PostResponse) => void;
}

/**
 * One post of a channel (the web's `app-post-item`): author, time, text, shared card / binder,
 * the reply toggle and the post options (edit and delete for the author, block the author for
 * everyone else). Editing happens in place; replies open inline.
 */
export function PostItem({ post, slug, selfId, onDelete, onBlockAuthor }: PostItemProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const update = useUpdatePost(slug);
  const own = !!selfId && post.author.id === selfId;
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.body);
  const [editError, setEditError] = useState<string | null>(null);
  const [repliesOpen, setRepliesOpen] = useState(false);

  const saveEdit = async () => {
    const body = editText.trim();
    if (!body) {
      setEditError('A post needs some text.');
      return;
    }
    if (body.length > POST_MAX_LENGTH) {
      setEditError(`Posts are limited to ${POST_MAX_LENGTH} characters.`);
      return;
    }
    if (body === post.body) {
      setEditing(false);
      return;
    }
    try {
      await update.mutateAsync({ id: post.id, body });
      setEditing(false);
      setEditError(null);
      snackbar.show('Post updated.');
    } catch (error) {
      setEditError(postErrorMessage(error as ApiError));
    }
  };

  return (
    <View
      testID={`post-${post.id}`}
      accessibilityLabel={`Post by ${post.author.displayName}`}
      style={[styles.post, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <View style={styles.head}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`View the profile of ${post.author.displayName}`}
          onPress={() =>
            router.push({ pathname: '/collectors/[id]', params: { id: post.author.handle } })
          }
          style={styles.who}
        >
          <Avatar src={post.author.avatarUrl} name={post.author.displayName} size={40} />
          <View style={styles.grow}>
            <Text style={[textStyle('md'), styles.strong, { color: palette.ink }]}>
              {post.author.displayName}
              {own ? <Text style={{ color: palette.primary }}> · You</Text> : null}
            </Text>
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              @{post.author.handle} · {relativeTime(post.createdAt)}
              {post.editedAt ? ' · edited' : ''}
            </Text>
          </View>
        </Pressable>
        {own && !post.canEdit && !post.canDelete ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Post options for the post of ${post.author.displayName}`}
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            testID={`post-menu-${post.id}`}
          >
            <MaterialCommunityIcons name="dots-horizontal" size={24} color={palette.textMuted} />
          </Pressable>
        )}
      </View>

      {editing ? (
        <View style={styles.edit}>
          <TextField
            label="Edit your post"
            value={editText}
            onChangeText={(value) => {
              setEditText(value);
              setEditError(null);
            }}
            multiline
            maxLength={POST_MAX_LENGTH + 1}
            error={editError}
            testID="post-edit-text"
          />
          <View style={styles.editActions}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => {
                setEditing(false);
                setEditError(null);
              }}
            />
            <Button
              label="Save"
              onPress={() => void saveEdit()}
              loading={update.isPending}
              loadingLabel="Saving…"
              testID="post-edit-save"
            />
          </View>
        </View>
      ) : (
        <Text selectable testID="post-body" style={[textStyle('md'), { color: palette.ink }]}>
          {post.body}
        </Text>
      )}

      {post.payload?.card || post.payload?.binder ? (
        <View style={styles.links}>
          {post.payload.card ? <SharedLinkCard card={post.payload.card} /> : null}
          {post.payload.binder ? <SharedLinkCard binder={post.payload.binder} /> : null}
        </View>
      ) : null}

      <View style={styles.foot}>
        <Pressable
          accessibilityRole="button"
          aria-expanded={repliesOpen}
          onPress={() => setRepliesOpen(!repliesOpen)}
          testID={`post-replies-toggle-${post.id}`}
          style={styles.footButton}
        >
          <MaterialCommunityIcons name="comment-outline" size={18} color={palette.accent} />
          <Text style={[textStyle('sm'), styles.strong, { color: palette.accent }]}>
            {post.replyCount === 0
              ? 'Reply'
              : `${post.replyCount} ${post.replyCount === 1 ? 'reply' : 'replies'}`}
          </Text>
        </Pressable>
        {post.lastReplyAt && post.replyCount > 0 ? (
          <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
            Last reply {relativeTime(post.lastReplyAt)}
          </Text>
        ) : null}
      </View>

      {repliesOpen ? <PostReplies post={post} slug={slug} selfId={selfId} /> : null}

      <BottomSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Post options"
        testID={`post-menu-sheet-${post.id}`}
      >
        {own ? (
          <>
            {post.canEdit ? (
              <ListRow
                icon="pencil-outline"
                label="Edit post"
                kind="button"
                onPress={() => {
                  setMenuOpen(false);
                  setEditText(post.body);
                  setEditError(null);
                  setEditing(true);
                }}
                testID="post-edit"
              />
            ) : null}
            {post.canDelete ? (
              <ListRow
                icon="delete-outline"
                label="Delete post"
                kind="button"
                tone="danger"
                onPress={() => {
                  setMenuOpen(false);
                  onDelete(post);
                }}
                testID="post-delete"
              />
            ) : null}
          </>
        ) : (
          <ListRow
            icon="cancel"
            label={`Block ${post.author.displayName}`}
            kind="button"
            tone="danger"
            onPress={() => {
              setMenuOpen(false);
              onBlockAuthor(post);
            }}
            testID="post-block-author"
          />
        )}
      </BottomSheet>
    </View>
  );
}

/** Inline replies of a post, oldest first, with the reply box (the web's `app-post-replies`). */
function PostReplies({
  post,
  slug,
  selfId,
}: {
  post: PostResponse;
  slug: string;
  selfId: string | null;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const replies = useCommunityReplies(post.id, true);
  const create = useCreateReply(slug, post.id);
  const remove = useDeleteReply(slug, post.id);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const items = useMemo<ReplyResponse[]>(
    () => replies.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [replies.data]
  );
  const tooLong = text.length > REPLY_MAX_LENGTH;
  const canSend = !create.isPending && text.trim().length > 0 && !tooLong;

  const send = async () => {
    if (!canSend) {
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({ body: text.trim() });
      setText('');
    } catch (caught) {
      setError(postErrorMessage(caught as ApiError));
    }
  };

  const deleteReply = async (reply: ReplyResponse) => {
    try {
      await remove.mutateAsync({ id: reply.id });
      snackbar.show('Reply deleted.');
    } catch (caught) {
      snackbar.show(postErrorMessage(caught as ApiError), { tone: 'error' });
    }
  };

  let list;
  if (replies.error && !replies.data) {
    list = (
      <View style={styles.note}>
        <Text accessibilityRole="alert" style={[textStyle('sm'), { color: palette.danger }]}>
          Replies could not load.
        </Text>
        <Button label="Retry" variant="ghost" onPress={() => void replies.refetch()} />
      </View>
    );
  } else if (!replies.data) {
    list = <SkeletonList rows={2} rowHeight={40} testID={`replies-loading-${post.id}`} />;
  } else {
    list = (
      <>
        {items.length === 0 ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            No replies yet. Start the conversation.
          </Text>
        ) : (
          items.map((reply) => (
            <View key={reply.id} style={styles.reply} testID={`reply-${reply.id}`}>
              <Avatar src={reply.author.avatarUrl} name={reply.author.displayName} size={28} />
              <View style={styles.grow}>
                <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                  <Text
                    accessibilityRole="link"
                    onPress={() =>
                      router.push({
                        pathname: '/collectors/[id]',
                        params: { id: reply.author.handle },
                      })
                    }
                    style={[styles.strong, { color: palette.ink }]}
                  >
                    {reply.author.displayName}
                  </Text>{' '}
                  · {relativeTime(reply.createdAt)}
                </Text>
                <Text selectable style={[textStyle('sm'), { color: palette.ink }]}>
                  {reply.body}
                </Text>
              </View>
              {reply.author.id === selfId && reply.canDelete ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete your reply"
                  onPress={() => void deleteReply(reply)}
                  hitSlop={8}
                  testID={`reply-delete-${reply.id}`}
                >
                  <MaterialCommunityIcons
                    name="delete-outline"
                    size={20}
                    color={palette.textMuted}
                  />
                </Pressable>
              ) : null}
            </View>
          ))
        )}
        {replies.hasNextPage ? (
          <Button
            label={replies.isFetchingNextPage ? 'Loading…' : 'More replies'}
            variant="ghost"
            onPress={() => void replies.fetchNextPage()}
          />
        ) : null}
      </>
    );
  }

  return (
    <View
      testID={`post-replies-${post.id}`}
      style={[styles.replies, { borderLeftColor: palette.border }]}
    >
      {list}
      <View style={styles.replyBox}>
        <TextField
          label={`Reply to ${post.author.displayName}`}
          value={text}
          onChangeText={(value) => {
            setText(value);
            setError(null);
          }}
          placeholder="Write a reply"
          multiline
          maxLength={REPLY_MAX_LENGTH + 1}
          error={tooLong ? `Replies are limited to ${REPLY_MAX_LENGTH} characters.` : error}
          containerStyle={styles.grow}
          testID={`reply-text-${post.id}`}
        />
        <Button
          label="Reply"
          variant="secondary"
          onPress={() => void send()}
          disabled={!canSend}
          loading={create.isPending}
          loadingLabel="Replying…"
          testID={`reply-submit-${post.id}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  post: { gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  edit: { gap: spacing[2] },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[2] },
  links: { gap: spacing[2] },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  footButton: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], paddingVertical: 4 },
  replies: { gap: spacing[3], paddingLeft: spacing[3], borderLeftWidth: 2 },
  reply: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  replyBox: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2] },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
});
