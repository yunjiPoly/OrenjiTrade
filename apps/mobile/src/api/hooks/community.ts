import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';

import { useAccount } from '@/src/account/AccountProvider';
import type { RoomDraft } from '@/src/features/community/communityHelpers';
import { postRequest } from '@/src/features/community/communityHelpers';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { imageFormData } from '../imageFormData';
import { meKeys } from '../queryKeys';
import type { CommunityChannel, ImageUploadResponse, PostPage, PostResponse } from '../types';
import { useUid } from './useUid';

/** Posts per page of `GET /community/channels/{slug}/posts`. */
export const POSTS_PAGE = 20;

type Uid = string | null;
type PostsData = InfiniteData<PostPage>;

function useReady(): boolean {
  return useAccount().status === 'ready';
}

/**
 * The feature flags (`publicChat` gates the community; `mlScanning` stays off) live in
 * `./featureFlags`; the community asks the API itself, which answers 404 `FEATURE_DISABLED`
 * when the flag is off.
 */
export { useFeatureFlags } from './featureFlags';

/**
 * `GET /api/v1/community/channels`: the rooms (stage R11, one per platform region and game), each
 * with the newest post the caller may see. `region` (a platform region code) keeps the five rooms
 * of that region; without it, every room.
 */
export function useCommunityRooms(region?: string | null, enabled = true) {
  const uid = useUid();
  const ready = useReady();
  return useQuery<CommunityChannel[], ApiError>({
    queryKey: meKeys.communityRooms(uid, region ?? null),
    queryFn: async () =>
      required(
        (
          await api.GET('/api/v1/community/channels', {
            params: { query: region ? { region } : {} },
          })
        ).data
      ),
    enabled: enabled && ready,
    staleTime: 30_000,
  });
}

/** A room's posts, newest first, cursor pages. 404 for an unknown or archived room. */
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
    staleTime: 15_000,
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

/** `POST /api/v1/uploads/images?kind=COMMUNITY`: one photo of a post (3 MB at most, re-encoded). */
async function uploadRoomPhoto(photo: RoomDraft['photos'][number]): Promise<string> {
  const body = await imageFormData(
    { uri: photo.uri, mimeType: photo.mimeType, fileName: photo.fileName, file: photo.file },
    'photo'
  );
  const upload: ImageUploadResponse = required(
    (
      await api.POST('/api/v1/uploads/images', {
        params: { query: { kind: 'COMMUNITY' } },
        // The contract types the multipart body as `{ file: binary }`; the FormData is sent as is.
        body: body as unknown as { file: string },
        bodySerializer: () => body,
      })
    ).data
  );
  return upload.uploadId;
}

/**
 * Posts a draft in a room (stage R11): its photos are uploaded first, one by one, in order
 * (`kind=COMMUNITY`, EXIF and GPS stripped by the API), then `POST
 * /api/v1/community/channels/{slug}/posts` with their upload ids. The post lands at the bottom of
 * the room and as the newest post of its room in every room list. A refusal (409, 413, 415, 422,
 * 429, or no network) rejects with the `ApiError` for the room to explain; the draft stays.
 */
export function useCreatePost(slug: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<PostResponse, ApiError, RoomDraft>({
    mutationFn: async (draft) => {
      const uploadIds: string[] = [];
      for (const photo of draft.photos) {
        uploadIds.push(await uploadRoomPhoto(photo));
      }
      return required(
        (
          await api.POST('/api/v1/community/channels/{slug}/posts', {
            params: { path: { slug } },
            body: postRequest(draft, uploadIds),
          })
        ).data
      );
    },
    onSuccess: (post) => {
      mapPosts(queryClient, uid, slug, (items, index) =>
        index === 0 ? [post, ...items.filter((item) => item.id !== post.id)] : items
      );
      queryClient.setQueriesData<CommunityChannel[]>(
        { queryKey: meKeys.communityRoomLists(uid) },
        (rooms) =>
          rooms?.map((room) =>
            room.slug === slug
              ? {
                  ...room,
                  postCount24h: room.postCount24h + 1,
                  lastPost: {
                    id: post.id,
                    authorHandle: post.author.handle,
                    body: post.body.replace(/\s+/g, ' ').trim().slice(0, 140),
                    createdAt: post.createdAt,
                    mine: true,
                  },
                }
              : room
          )
      );
    },
  });
}

/** `DELETE /api/v1/community/posts/{id}`: the post and its photos leave the room. */
export function useDeletePost(slug: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: string }>({
    mutationFn: async ({ id }) => {
      await api.DELETE('/api/v1/community/posts/{id}', { params: { path: { id } } });
    },
    onSuccess: (_, { id }) => {
      mapPosts(queryClient, uid, slug, (items) => items.filter((post) => post.id !== id));
      void queryClient.invalidateQueries({ queryKey: meKeys.communityRoomLists(uid) });
    },
  });
}

/**
 * Hides the posts of a collector the caller just blocked, in every room read so far, and asks the
 * room lists again (their newest post may have been one of theirs).
 */
export function hideAuthor(queryClient: QueryClient, uid: Uid, authorId: string) {
  for (const [key] of queryClient.getQueriesData<PostsData>({
    queryKey: [...meKeys.community(uid), 'posts'],
  })) {
    queryClient.setQueryData<PostsData>(key, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: (page.items ?? []).filter((post) => post.author.id !== authorId),
            })),
          }
        : data
    );
  }
  void queryClient.invalidateQueries({ queryKey: meKeys.communityRoomLists(uid) });
}
