import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';

import { useAccount } from '@/src/account/AccountProvider';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys, publicKeys } from '../queryKeys';
import type {
  CommunityChannel,
  CreatePostRequest,
  PostPage,
  PostResponse,
  ReplyPage,
  ReplyResponse,
} from '../types';
import { useUid } from './useUid';

/** Posts per page of `GET /community/channels/{slug}/posts`. */
export const POSTS_PAGE = 20;
/** Replies per page of `GET /community/posts/{id}/replies`. */
export const REPLIES_PAGE = 50;

type Uid = string | null;
type PostsData = InfiniteData<PostPage>;
type RepliesData = InfiniteData<ReplyPage>;

function useReady(): boolean {
  return useAccount().status === 'ready';
}

/**
 * `GET /api/v1/public/feature-flags` (`publicChat` gates the community; `mlScanning` stays off).
 * An unreadable answer counts as "unknown": the community then asks the API itself, which
 * answers 403 `FEATURE_DISABLED` when the flag is off.
 */
export function useFeatureFlags() {
  return useQuery<Record<string, boolean>, ApiError>({
    queryKey: publicKeys.featureFlags,
    queryFn: async () => required((await api.GET('/api/v1/public/feature-flags')).data),
    staleTime: 5 * 60_000,
  });
}

/** `GET /api/v1/community/channels`: every channel with its posts of the last 24 hours. */
export function useCommunityChannels(enabled = true) {
  const uid = useUid();
  const ready = useReady();
  return useQuery<CommunityChannel[], ApiError>({
    queryKey: meKeys.communityChannels(uid),
    queryFn: async () => required((await api.GET('/api/v1/community/channels')).data),
    enabled: enabled && ready,
    staleTime: 60_000,
  });
}

/** A channel's posts, newest first, cursor pages. 404 for an unknown or archived channel. */
export function useCommunityPosts(slug: string | null | undefined) {
  const uid = useUid();
  const ready = useReady();
  return useInfiniteQuery<PostPage, ApiError>({
    queryKey: meKeys.communityPosts(uid, slug ?? ''),
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/community/channels/{slug}/posts', {
            params: {
              path: { slug: slug ?? '' },
              query: { cursor: (pageParam as string | null) ?? undefined, limit: POSTS_PAGE },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    enabled: !!slug && ready,
    staleTime: 30_000,
  });
}

/** The replies of one post, oldest first (loaded when its thread is opened). */
export function useCommunityReplies(postId: string, enabled: boolean) {
  const uid = useUid();
  const ready = useReady();
  return useInfiniteQuery<ReplyPage, ApiError>({
    queryKey: meKeys.communityReplies(uid, postId),
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/community/posts/{id}/replies', {
            params: {
              path: { id: postId },
              query: { cursor: (pageParam as string | null) ?? undefined, limit: REPLIES_PAGE },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    enabled: enabled && ready,
    staleTime: 30_000,
  });
}

function mapPosts(
  queryClient: QueryClient,
  uid: Uid,
  slug: string,
  change: (items: PostResponse[], pageIndex: number) => PostResponse[]
): void {
  queryClient.setQueryData<PostsData>(meKeys.communityPosts(uid, slug), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page, index) => ({
            ...page,
            items: change(page.items ?? [], index),
          })),
        }
      : data
  );
}

function patchPost(
  queryClient: QueryClient,
  uid: Uid,
  slug: string,
  id: string,
  change: (post: PostResponse) => PostResponse
): void {
  mapPosts(queryClient, uid, slug, (items) =>
    items.map((post) => (post.id === id ? change(post) : post))
  );
}

/** `POST /api/v1/community/channels/{slug}/posts`: on top of the feed, one more post today. */
export function useCreatePost(slug: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<PostResponse, ApiError, CreatePostRequest>({
    mutationFn: async (body) =>
      required(
        (
          await api.POST('/api/v1/community/channels/{slug}/posts', {
            params: { path: { slug } },
            body,
          })
        ).data
      ),
    onSuccess: (post) => {
      mapPosts(queryClient, uid, slug, (items, index) =>
        index === 0 ? [post, ...items.filter((item) => item.id !== post.id)] : items
      );
      queryClient.setQueryData<CommunityChannel[]>(meKeys.communityChannels(uid), (channels) =>
        channels?.map((channel) =>
          channel.slug === slug ? { ...channel, postCount24h: channel.postCount24h + 1 } : channel
        )
      );
    },
  });
}

/** `PATCH /api/v1/community/posts/{id}` (own posts while `canEdit`). */
export function useUpdatePost(slug: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<PostResponse, ApiError, { id: string; body: string }>({
    mutationFn: async ({ id, body }) =>
      required(
        (
          await api.PATCH('/api/v1/community/posts/{id}', {
            params: { path: { id } },
            body: { body },
          })
        ).data
      ),
    onSuccess: (post) => patchPost(queryClient, uid, slug, post.id, () => post),
  });
}

/** `DELETE /api/v1/community/posts/{id}`: the post and its replies leave the channel. */
export function useDeletePost(slug: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: string }>({
    mutationFn: async ({ id }) => {
      await api.DELETE('/api/v1/community/posts/{id}', { params: { path: { id } } });
    },
    onSuccess: (_, { id }) => {
      mapPosts(queryClient, uid, slug, (items) => items.filter((post) => post.id !== id));
      queryClient.removeQueries({ queryKey: meKeys.communityReplies(uid, id) });
    },
  });
}

/** Hides the posts and replies of a collector the caller just blocked. */
export function hideAuthor(queryClient: QueryClient, uid: Uid, slug: string, authorId: string) {
  mapPosts(queryClient, uid, slug, (items) => items.filter((post) => post.author.id !== authorId));
  for (const [key] of queryClient.getQueriesData<RepliesData>({
    queryKey: [...meKeys.community(uid), 'replies'],
  })) {
    queryClient.setQueryData<RepliesData>(key, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: (page.items ?? []).filter((reply) => reply.author.id !== authorId),
            })),
          }
        : data
    );
  }
}

/** `POST /api/v1/community/posts/{id}/replies`: at the end of the thread, one more reply. */
export function useCreateReply(slug: string, postId: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<ReplyResponse, ApiError, { body: string }>({
    mutationFn: async ({ body }) =>
      required(
        (
          await api.POST('/api/v1/community/posts/{id}/replies', {
            params: { path: { id: postId } },
            body: { body },
          })
        ).data
      ),
    onSuccess: (reply) => {
      queryClient.setQueryData<RepliesData>(meKeys.communityReplies(uid, postId), (data) => {
        if (!data || data.pages.length === 0) {
          return data;
        }
        const last = data.pages.length - 1;
        return {
          ...data,
          pages: data.pages.map((page, index) =>
            index === last
              ? {
                  ...page,
                  items: [...(page.items ?? []).filter((item) => item.id !== reply.id), reply],
                }
              : page
          ),
        };
      });
      patchPost(queryClient, uid, slug, postId, (post) => ({
        ...post,
        replyCount: post.replyCount + 1,
        lastReplyAt: reply.createdAt,
      }));
    },
  });
}

/** `DELETE /api/v1/community/replies/{id}` (own replies). */
export function useDeleteReply(slug: string, postId: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: string }>({
    mutationFn: async ({ id }) => {
      await api.DELETE('/api/v1/community/replies/{id}', { params: { path: { id } } });
    },
    onSuccess: (_, { id }) => {
      queryClient.setQueryData<RepliesData>(meKeys.communityReplies(uid, postId), (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: (page.items ?? []).filter((reply) => reply.id !== id),
              })),
            }
          : data
      );
      patchPost(queryClient, uid, slug, postId, (post) => ({
        ...post,
        replyCount: Math.max(0, post.replyCount - 1),
      }));
    },
  });
}
