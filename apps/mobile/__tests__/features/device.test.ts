import * as Sharing from 'expo-sharing';

import { exportMyData } from '@/src/features/account/exportData';

import { mockApi, ok } from '../support/mockApi';

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
