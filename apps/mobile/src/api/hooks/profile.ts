import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { imageFormData, type PickedImage } from '../imageFormData';
import { meKeys, publicKeys } from '../queryKeys';
import type {
  AvatarResponse,
  GameResponse,
  MyProfileResponse,
  TagResponse,
  UpdateProfileRequest,
} from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/** `GET /api/v1/me/profile`. */
export function useMyProfile() {
  const uid = useUid();
  return useQuery<MyProfileResponse, ApiError>({
    queryKey: meKeys.profile(uid),
    queryFn: async () => required((await api.GET('/api/v1/me/profile')).data),
    enabled: useIsAuthenticated(),
  });
}

/**
 * `PUT /api/v1/me/profile` (replaces every editable field). Refreshes `/me` too: the onboarding
 * flags, the display name and the handle shown in headers come from there.
 */
export function useSaveProfile() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<MyProfileResponse, ApiError, UpdateProfileRequest>({
    mutationFn: async (body) => required((await api.PUT('/api/v1/me/profile', { body })).data),
    onSuccess: async (profile) => {
      queryClient.setQueryData(meKeys.profile(uid), profile);
      await queryClient.invalidateQueries({ queryKey: meKeys.account(uid) });
    },
  });
}

export interface SaveTagsInput {
  tags: readonly TagResponse[];
  customLabels: readonly string[];
}

/** `PUT /api/v1/me/profile/tags`: curated tag ids plus free custom labels (12 at most). */
export function useSaveTags() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<TagResponse[], ApiError, SaveTagsInput>({
    mutationFn: async ({ tags, customLabels }) =>
      required(
        (
          await api.PUT('/api/v1/me/profile/tags', {
            body: { tagIds: tags.map((tag) => tag.id), customLabels: [...customLabels] },
          })
        ).data
      ),
    onSuccess: async (saved) => {
      queryClient.setQueryData<MyProfileResponse>(meKeys.profile(uid), (profile) =>
        profile ? { ...profile, tags: saved } : profile
      );
      await queryClient.invalidateQueries({ queryKey: meKeys.account(uid) });
    },
  });
}

/** `GET /api/v1/tags?query=`: curated tag suggestions (debounce the query in the caller). */
export function useTagSearch(query: string) {
  const trimmed = query.trim();
  return useQuery<TagResponse[], ApiError>({
    queryKey: publicKeys.tags(trimmed),
    queryFn: async () =>
      required(
        (
          await api.GET('/api/v1/tags', {
            params: { query: { query: trimmed || undefined, limit: 24 } },
          })
        ).data
      ),
    enabled: useIsAuthenticated(),
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });
}

/** `GET /api/v1/games`: ACTIVE games in display order (hidden games disappear from pickers). */
export function useGames() {
  return useQuery<GameResponse[], ApiError>({
    queryKey: publicKeys.games,
    queryFn: async () => required((await api.GET('/api/v1/games')).data),
    staleTime: 60 * 60_000,
  });
}

export type { PickedImage } from '../imageFormData';

/** `POST /api/v1/me/profile/avatar` (multipart, JPEG/PNG/WebP up to 5 MB). */
export function useUploadAvatar() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<AvatarResponse, ApiError, PickedImage>({
    mutationFn: async (image) => {
      const body = await imageFormData(image, 'avatar');
      const { data } = await api.POST('/api/v1/me/profile/avatar', {
        // The contract types the multipart body as `{ file: binary }`; the FormData is sent as is
        // (openapi-fetch then lets the platform set the multipart boundary).
        body: body as unknown as { file: string },
        bodySerializer: () => body,
      });
      return required(data);
    },
    onSuccess: async (response) => {
      queryClient.setQueryData<MyProfileResponse>(meKeys.profile(uid), (profile) =>
        profile ? { ...profile, avatarUrl: response.avatarUrl } : profile
      );
      await queryClient.invalidateQueries({ queryKey: meKeys.account(uid) });
    },
  });
}

/** `DELETE /api/v1/me/profile/avatar`. */
export function useDeleteAvatar() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: async () => {
      await api.DELETE('/api/v1/me/profile/avatar');
    },
    onSuccess: async () => {
      queryClient.setQueryData<MyProfileResponse>(meKeys.profile(uid), (profile) =>
        profile ? { ...profile, avatarUrl: null } : profile
      );
      await queryClient.invalidateQueries({ queryKey: meKeys.account(uid) });
    },
  });
}
