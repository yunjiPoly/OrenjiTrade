import * as Location from 'expo-location';

import { roundCoordinate } from '@/src/lib/location';

export type ApproximatePosition =
  { status: 'ok'; lat: number; lng: number } | { status: 'denied' } | { status: 'unavailable' };

/** Same limits as the web's `getCurrentPosition` call: a fix up to 10 min old, 10 s to get one. */
export const LOCATION_MAX_AGE_MS = 600_000;
export const LOCATION_TIMEOUT_MS = 10_000;

type Fix = Pick<Location.LocationObject, 'coords'>;

/** Resolves with the promise's value, or with null when it takes longer than `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Reads the device position ONCE at reduced accuracy (iOS `NSLocationDefaultAccuracyReduced`,
 * `Accuracy.Low` everywhere), rounded to 3 decimals like the web (`roundCoordinate`). Like the
 * web (`maximumAge` 10 min, `timeout` 10 s) a recent last-known fix is reused, and a device that
 * cannot produce a fix within 10 s reports `unavailable` instead of spinning forever.
 *
 * Privacy (ADR 0004): the caller hands the result straight to the API
 * (`PUT /me/location/trading-area`, source DEVICE), which snaps it; it is never rendered, stored in
 * state, persisted on the device or logged.
 */
export async function readApproximatePosition(): Promise<ApproximatePosition> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return { status: 'denied' };
    }
    const recent: Fix | null = await Location.getLastKnownPositionAsync({
      maxAge: LOCATION_MAX_AGE_MS,
    }).catch(() => null);
    const fix: Fix | null =
      recent ??
      (await within(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
        LOCATION_TIMEOUT_MS
      ));
    if (!fix) {
      return { status: 'unavailable' };
    }
    return {
      status: 'ok',
      lat: roundCoordinate(fix.coords.latitude),
      lng: roundCoordinate(fix.coords.longitude),
    };
  } catch {
    return { status: 'unavailable' };
  }
}
