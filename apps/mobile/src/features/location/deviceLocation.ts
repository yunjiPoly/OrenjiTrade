import * as Location from 'expo-location';

import { roundCoordinate } from '@/src/lib/location';

export type ApproximatePosition =
  { status: 'ok'; lat: number; lng: number } | { status: 'denied' } | { status: 'unavailable' };

/**
 * Reads the device position ONCE at reduced accuracy (iOS `NSLocationDefaultAccuracyReduced`,
 * `Accuracy.Low` everywhere), rounded to 3 decimals. Privacy (ADR 0004): the caller hands it
 * straight to the API (`PUT /me/location/trading-area`, source DEVICE), which snaps it; it is
 * never rendered, stored in state, or persisted on the device.
 */
export async function readApproximatePosition(): Promise<ApproximatePosition> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return { status: 'denied' };
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });
    return {
      status: 'ok',
      lat: roundCoordinate(position.coords.latitude),
      lng: roundCoordinate(position.coords.longitude),
    };
  } catch {
    return { status: 'unavailable' };
  }
}
