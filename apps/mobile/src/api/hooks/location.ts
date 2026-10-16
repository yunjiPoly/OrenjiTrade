import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { MyLocationResponse, PrivacySettings, UpdateLocationRequest } from '../types';
import { refreshInventory } from './inventory';
import { useIsAuthenticated, useUid } from './useUid';

/**
 * `GET /api/v1/me/location`: the owner's self-declared location (ADR 0017: country, state or
 * province, optional city and "show my city"), with its public label and discoverability. No
 * coordinate exists.
 */
export function useMyLocation() {
  const uid = useUid();
  return useQuery<MyLocationResponse, ApiError>({
    queryKey: meKeys.location(uid),
    queryFn: async () => required((await api.GET('/api/v1/me/location')).data),
    enabled: useIsAuthenticated(),
  });
}

/** `GET /api/v1/me/settings/privacy`. */
export function usePrivacySettings() {
  const uid = useUid();
  return useQuery<PrivacySettings, ApiError>({
    queryKey: meKeys.privacy(uid),
    queryFn: async () => required((await api.GET('/api/v1/me/settings/privacy')).data),
    enabled: useIsAuthenticated(),
  });
}

/** The `PUT /me/location` body: codes as chosen, the city trimmed (blank clears it). */
export function locationBody(input: UpdateLocationRequest): UpdateLocationRequest {
  const city = input.city?.trim() ?? '';
  return {
    countryCode: input.countryCode,
    subdivisionCode: input.subdivisionCode,
    city: city === '' ? null : city,
    showCity: input.showCity ?? true,
  };
}

/**
 * `PUT /api/v1/me/location`: country and subdivision from `GET /regions` (unknown codes are a
 * 400), an optional city (never geocoded). `/me` is reloaded: the onboarding flag and the home
 * region follow. So are the owner's cards and binders: whether others can see them
 * (`effectivePublic`, the Public or Private tag of each Inventory card) follows the owner's
 * location and discoverability.
 */
export function useSaveLocation() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<MyLocationResponse, ApiError, UpdateLocationRequest>({
    mutationFn: async (input) =>
      required((await api.PUT('/api/v1/me/location', { body: locationBody(input) })).data),
    onSuccess: async (location) => {
      queryClient.setQueryData(meKeys.location(uid), location);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meKeys.account(uid) }),
        refreshInventory(queryClient, uid),
      ]);
    },
  });
}

/**
 * `DELETE /api/v1/me/location`: removes the location (the server turns discoverability off, so the
 * owner's public cards and binders may stop being visible: they are read again).
 */
export function useRemoveLocation() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: async () => {
      await api.DELETE('/api/v1/me/location');
    },
    onSuccess: async () => {
      queryClient.setQueryData<MyLocationResponse>(meKeys.location(uid), { discoverable: false });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meKeys.privacy(uid) }),
        queryClient.invalidateQueries({ queryKey: meKeys.account(uid) }),
        refreshInventory(queryClient, uid),
      ]);
    },
  });
}

/**
 * `PUT /api/v1/me/settings/privacy` (replaces the whole document). Becoming discoverable needs a
 * location (409 LOCATION_REQUIRED otherwise); the location answer carries the flag too. "Show me on
 * the map" and the profile's visibility decide whether others see the owner's public cards and
 * binders: they are read again, so no Inventory card keeps an old Public or Private tag.
 */
export function useSavePrivacy() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<PrivacySettings, ApiError, PrivacySettings>({
    mutationFn: async (body) =>
      required((await api.PUT('/api/v1/me/settings/privacy', { body })).data),
    onSuccess: async (saved) => {
      queryClient.setQueryData(meKeys.privacy(uid), saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meKeys.location(uid) }),
        refreshInventory(queryClient, uid),
      ]);
    },
  });
}
