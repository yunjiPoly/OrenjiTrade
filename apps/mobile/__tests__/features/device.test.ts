import * as Location from 'expo-location';
import * as Sharing from 'expo-sharing';

import { exportMyData } from '@/src/features/account/exportData';
import {
  LOCATION_MAX_AGE_MS,
  LOCATION_TIMEOUT_MS,
  readApproximatePosition,
} from '@/src/features/location/deviceLocation';

import { mockApi, ok } from '../support/mockApi';

jest.mock('expo-location', () => ({
  Accuracy: { Low: 2 },
  requestForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(),
}));

const mockWrites: { name: string; content: string }[] = [];
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class MockFile {
    uri: string;
    mockName: string;
    constructor(_dir: string, mockFileName: string) {
      this.mockName = mockFileName;
      this.uri = `file:///cache/${mockFileName}`;
    }
    create() {}
    write(content: string) {
      mockWrites.push({ name: this.mockName, content });
    }
  },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

const location = Location as jest.Mocked<typeof Location>;

describe('readApproximatePosition (ADR 0004)', () => {
  it('asks for permission, reads once at low accuracy and rounds to 3 decimals', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ granted: true } as never);
    location.getCurrentPositionAsync.mockResolvedValueOnce({
      coords: { latitude: 45.5016891, longitude: -73.5672561 },
    } as never);
    await expect(readApproximatePosition()).resolves.toEqual({
      status: 'ok',
      lat: 45.502,
      lng: -73.567,
    });
    expect(location.getCurrentPositionAsync).toHaveBeenCalledWith({
      accuracy: Location.Accuracy.Low,
    });
  });

  it('reuses a fix of the last 10 minutes, like the web (maximumAge)', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ granted: true } as never);
    location.getLastKnownPositionAsync.mockResolvedValueOnce({
      coords: { latitude: 46.8131873, longitude: -71.2075251 },
    } as never);
    await expect(readApproximatePosition()).resolves.toEqual({
      status: 'ok',
      lat: 46.813,
      lng: -71.208,
    });
    expect(location.getLastKnownPositionAsync).toHaveBeenCalledWith({
      maxAge: LOCATION_MAX_AGE_MS,
    });
    expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('gives up after 10 s without a fix instead of spinning forever', async () => {
    jest.useFakeTimers();
    try {
      location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ granted: true } as never);
      location.getCurrentPositionAsync.mockReturnValueOnce(new Promise(() => undefined));
      const result = readApproximatePosition();
      await jest.advanceTimersByTimeAsync(LOCATION_TIMEOUT_MS);
      await expect(result).resolves.toEqual({ status: 'unavailable' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports a refusal or an unavailable position', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ granted: false } as never);
    await expect(readApproximatePosition()).resolves.toEqual({ status: 'denied' });
    location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ granted: true } as never);
    location.getCurrentPositionAsync.mockRejectedValueOnce(new Error('Location services off'));
    await expect(readApproximatePosition()).resolves.toEqual({ status: 'unavailable' });
  });
});

describe('exportMyData (native)', () => {
  it('writes GET /me/export to the cache directory and opens the share sheet', async () => {
    mockApi({
      'GET /api/v1/me/export': ok({
        account: { handle: 'maika' },
        exportedAt: '2026-10-04T12:00:00Z',
      }),
    });
    const name = await exportMyData('maika');
    expect(name).toMatch(/^orenjitrade-export-maika-\d{4}-\d{2}-\d{2}\.json$/);
    expect(mockWrites.at(-1)?.name).toBe(name);
    expect(JSON.parse(mockWrites.at(-1)?.content ?? '{}')).toEqual({
      account: { handle: 'maika' },
      exportedAt: '2026-10-04T12:00:00Z',
    });
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      `file:///cache/${name}`,
      expect.objectContaining({ mimeType: 'application/json' })
    );
  });

  it('fails clearly when the device cannot share files', async () => {
    mockApi({ 'GET /api/v1/me/export': ok({}) });
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    await expect(exportMyData('maika')).rejects.toThrow(
      'Sharing files is not available on this device.'
    );
  });
});
