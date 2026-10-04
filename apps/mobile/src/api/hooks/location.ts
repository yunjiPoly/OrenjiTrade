import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { roundCoordinate } from '@/src/lib/location';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { MyLocationResponse, PrivacySettings, TradingAreaSource } from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/**
 * `GET /api/v1/me/location`: the owner's trading area (centre rounded to 3 decimals by the API,
 * kept in memory only and never rendered as numbers), its public label, discoverability and the
 * derived public point.
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

/** A trading-area centre to send: never stored on the device, rounded before it leaves. */
export interface TradingAreaInput {
  lat: number;
  lng: number;
  radiusKm: number;
  source: TradingAreaSource;
}

/** The `PUT /me/location/trading-area` body: 3 decimals at most (ADR 0004), radius 1–50 km. */
export function tradingAreaBody(area: TradingAreaInput) {
  return {
    lat: roundCoordinate(area.lat),
    lng: roundCoordinate(area.lng),
    radiusKm: Math.min(50, Math.max(1, Math.round(area.radiusKm))),
    source: area.source,
  };
}

/**
 * `PUT /api/v1/me/location/trading-area`. The server snaps the centre, derives the public label
 * and point; a device position (`source: DEVICE`) is only ever sent here, never kept.
 */
export function useSaveTradingArea() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<MyLocationResponse, ApiError, TradingAreaInput>({
    mutationFn: async (area) =>
      required(
        (await api.PUT('/api/v1/me/location/trading-area', { body: tradingAreaBody(area) })).data
      ),
    onSuccess: async (location) => {
      queryClient.setQueryData(meKeys.location(uid), location);
      await queryClient.invalidateQueries({ queryKey: meKeys.account(uid) });
    },
  });
}

/** `DELETE /api/v1/me/location`: removes the trading area (the collector leaves the map). */
export function useRemoveLocation() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: async () => {
      await api.DELETE('/api/v1/me/location');
    },
    onSuccess: async () => {
      queryClient.setQueryData<MyLocationResponse>(meKeys.location(uid), (location) => ({
        discoverable: location?.discoverable ?? false,
      }));
      await queryClient.invalidateQueries({ queryKey: meKeys.account(uid) });
    },
  });
}

/**
 * `PUT /api/v1/me/settings/privacy` (replaces the whole document). Discoverability changes the
 * public point, so the location is refreshed too.
 */
export function useSavePrivacy() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<PrivacySettings, ApiError, PrivacySettings>({
    mutationFn: async (body) =>
      required((await api.PUT('/api/v1/me/settings/privacy', { body })).data),
    onSuccess: async (saved) => {
      queryClient.setQueryData(meKeys.privacy(uid), saved);
      await queryClient.invalidateQueries({ queryKey: meKeys.location(uid) });
    },
  });
}
