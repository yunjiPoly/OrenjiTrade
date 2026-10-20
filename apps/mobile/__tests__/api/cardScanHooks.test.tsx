import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/src/api/ApiError';
import {
  addInventoryItemsBatch,
  isOfflineError,
  matchScannedCard,
  scanCallFailure,
  scanMatchBody,
  useAddScannedCards,
} from '@/src/api/hooks/cardScan';
import { FEATURE } from '@/src/api/hooks/featureFlags';
import { meKeys } from '@/src/api/queryKeys';
import { setIdTokenProvider } from '@/src/auth/tokenProvider';
import { getDeviceOcrProvider, resetDeviceOcrProvider } from '@/src/features/scan/ocr/deviceOcr';
import type { CardScanMatch } from '@/src/features/scan/types';
import { useCardScanAvailability } from '@/src/features/scan/useCardScanAvailability';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { mockApi, ok, problem } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { createTestQueryClient, resetAppState, TestProviders } from '../test-utils';

const READ = { codes: ['ZACR-EN036'], names: ['Yew Flowers & Velvet Breeze'] };

const FOUND: CardScanMatch = {
  status: 'FOUND',
  card: {
    id: 'card-yew',
    name: 'Yew Flowers & Velvet Breeze',
    imageUrl: '/api/v1/public/card-images/img-yew',
  },
  printing: {
    id: 'p-zacr-036',
    printingCode: 'ZACR-EN036',
    setCode: 'ZACR',
    setName: 'Lantern Crisis',
    rarity: 'Secret Rare',
  },
  rarities: [],
  printings: [],
  otherMatches: [],
  read: READ,
};

const FEATURE_DISABLED = problem(404, 'FEATURE_DISABLED', 'This feature is not available', {
  feature: 'cardTextScan',
});

beforeEach(() => {
  resetAppState();
  resetDeviceOcrProvider();
});

afterEach(() => {
  setIdTokenProvider(null);
  resetDeviceOcrProvider();
});

function setup() {
  const queryClient = createTestQueryClient();
  const port = new FakeAuthPort(testUser());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestProviders queryClient={queryClient} port={port}>
      {children}
    </TestProviders>
  );
  return { queryClient, wrapper };
}

describe('POST /cards/scan-match', () => {
  it('sends only the text read, in the body, with the ID token', async () => {
    setIdTokenProvider(async () => 'scan-token');
    const api = mockApi({ 'POST /api/v1/cards/scan-match': ok(FOUND) });
    await expect(matchScannedCard(READ)).resolves.toEqual(FOUND);
    const [call] = api.callsTo('POST /api/v1/cards/scan-match');
    expect(call?.body).toEqual({
      game: 'yugioh',
      codes: ['ZACR-EN036'],
      names: ['Yew Flowers & Velvet Breeze'],
    });
    expect([...(call?.query.keys() ?? [])]).toEqual([]);
    expect(call?.headers.get('Authorization')).toBe('Bearer scan-token');
  });

  it("keeps the body within the API's limits", () => {
    expect(
      scanMatchBody({
        codes: ['A-001', '', 'B-002', 'C-003', 'D-004', 'X'.repeat(50)],
        names: ['N'.repeat(200)],
      })
    ).toEqual({
      game: 'yugioh',
      codes: ['A-001', 'B-002', 'C-003'],
      names: ['N'.repeat(150)],
    });
  });

  it('is refused with 404 FEATURE_DISABLED while the flag is off: no "offline" wait', async () => {
    mockApi({ 'POST /api/v1/cards/scan-match': FEATURE_DISABLED });
    const error = await matchScannedCard(READ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).errorCode).toBe('FEATURE_DISABLED');
    expect(isOfflineError(error)).toBe(false);
  });

  it('fails as offline when the network is down', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const error = await matchScannedCard(READ).catch((caught: unknown) => caught);
    expect(isOfflineError(error)).toBe(true);
  });

  it('gives a match up that gets no answer in time, as offline', async () => {
    let aborted = false;
    globalThis.fetch = jest.fn(
      (input: RequestInfo | URL) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (input as Request).signal;
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        })
    ) as unknown as typeof fetch;
    const error = await matchScannedCard(READ, { timeoutMs: 30 }).catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isTimeout).toBe(true);
    expect(isOfflineError(error)).toBe(true);
    expect(aborted).toBe(true);
  });
});

describe('POST /inventory/items/batch', () => {
  const BODY = {
    visibility: 'PRIVATE' as const,
    lines: [
      { printingId: 'p-zacr-036', quantity: 2 },
      { printingId: 'p-zago-011', quantity: 1 },
    ],
  };
  const ADDED = {
    itemsCreated: 1,
    itemsRaised: 1,
    copiesAdded: 3,
    copiesNotAdded: 0,
    createdItemIds: ['item-1'],
    raisedItemIds: ['item-2'],
  };

  const KEY = 'scan-0b7c3f7e-6d3c-4d1e-9a51-3f1f0f0e6a11';
  const REQUEST = { body: BODY, idempotencyKey: KEY };

  it('adds the ready cards with the key of the add, then reads the inventory and the binders again', async () => {
    const api = mockApi(signedInRoutes({ 'POST /api/v1/inventory/items/batch': ok(ADDED) }));
    const { queryClient, wrapper } = setup();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useAddScannedCards(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(REQUEST)).resolves.toEqual(ADDED);
    });
    const sent = api.callsTo('POST /api/v1/inventory/items/batch')[0];
    expect(sent?.body).toEqual(BODY);
    // Adding again after a lost answer gets the first answer back: nothing is added twice.
    expect(sent?.headers.get('Idempotency-Key')).toBe(KEY);
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(keys).toContain(JSON.stringify(meKeys.inventory('uid-maika')));
    expect(keys).toContain(JSON.stringify(meKeys.binders('uid-maika')));
  });

  it('passes the limit refusal on, nothing added', async () => {
    mockApi(
      signedInRoutes({
        'POST /api/v1/inventory/items/batch': problem(429, 'LIMIT_REACHED', 'Limit reached', {
          limitKey: 'inventory.items.max',
          limit: 3,
          used: 2,
          requested: 2,
        }),
      })
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useAddScannedCards(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(REQUEST).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.error?.errorCode).toBe('LIMIT_REACHED'));
    expect(result.current.error?.status).toBe(429);
  });

  it('is a plain function too', async () => {
    mockApi({ 'POST /api/v1/inventory/items/batch': ok(ADDED) });
    await expect(addInventoryItemsBatch(REQUEST)).resolves.toEqual(ADDED);
  });

  it('gives the add up without an answer in time, as a network error', async () => {
    let aborted = false;
    globalThis.fetch = jest.fn(
      (input: RequestInfo | URL) =>
        new Promise<Response>((_resolve, reject) => {
          (input as Request).signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        })
    ) as unknown as typeof fetch;
    const error = await addInventoryItemsBatch(REQUEST, { timeoutMs: 30 }).catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isTimeout).toBe(true);
    expect(aborted).toBe(true);
  });

  it('reads the inventory again when the add got no answer: it may have gone through', async () => {
    mockApi(
      signedInRoutes({
        'POST /api/v1/inventory/items/batch': [
          () => {
            throw new TypeError('Network request failed');
          },
          problem(503, 'SERVICE_UNAVAILABLE', 'Try later'),
          problem(404, 'NOT_FOUND', 'Binder not found'),
        ],
      })
    );
    const { queryClient, wrapper } = setup();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useAddScannedCards(), { wrapper });
    const inventoryReads = () =>
      invalidate.mock.calls.filter(
        ([filters]) =>
          JSON.stringify(filters?.queryKey) === JSON.stringify(meKeys.inventory('uid-maika'))
      ).length;
    await act(async () => {
      await result.current.mutateAsync(REQUEST).catch(() => undefined);
    });
    expect(inventoryReads()).toBe(1);
    await act(async () => {
      await result.current.mutateAsync(REQUEST).catch(() => undefined);
    });
    expect(inventoryReads()).toBe(2);
    // A refusal wrote nothing: nothing to read again.
    await act(async () => {
      await result.current.mutateAsync(REQUEST).catch(() => undefined);
    });
    expect(inventoryReads()).toBe(2);
  });

  it('says the add failed at once, without waiting for the inventory to be read again', async () => {
    mockApi(
      signedInRoutes({
        'POST /api/v1/inventory/items/batch': () => {
          throw new TypeError('Network request failed');
        },
      })
    );
    const { queryClient, wrapper } = setup();
    // A network that stalls: the reads of the inventory never end.
    jest.spyOn(queryClient, 'invalidateQueries').mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useAddScannedCards(), { wrapper });
    let failed: unknown = null;
    await act(async () => {
      failed = await result.current.mutateAsync(REQUEST).catch((caught: unknown) => caught);
    });
    expect((failed as ApiError).isNetworkError).toBe(true);
    expect(queryClient.invalidateQueries).toHaveBeenCalled();
  });
});

describe('why a call of the scan failed', () => {
  it('tells no answer, a service that could not answer this time, and a refusal apart', () => {
    expect(scanCallFailure(ApiError.network(new TypeError('Network request failed')))).toBe(
      'NETWORK'
    );
    expect(scanCallFailure(ApiError.timeout(20_000))).toBe('NETWORK');
    for (const status of [500, 502, 503, 504, 408, 429]) {
      expect(scanCallFailure(new ApiError({ status, errorCode: 'X', message: 'x' }))).toBe(
        'SERVER'
      );
    }
    for (const status of [400, 401, 403, 404, 422]) {
      expect(scanCallFailure(new ApiError({ status, errorCode: 'X', message: 'x' }))).toBe(
        'REFUSED'
      );
    }
    expect(scanCallFailure(new Error('not an API error'))).toBe('REFUSED');
  });
});

describe('whether the scan is offered', () => {
  const reader = {
    recognize: async () => ({ lines: [] }),
  };

  function flags(cardTextScan: boolean | undefined) {
    return mockApi(
      signedInRoutes({
        'GET /api/v1/public/feature-flags': ok(
          cardTextScan === undefined ? {} : { [FEATURE.cardTextScan]: cardTextScan }
        ),
      })
    );
  }

  it('reads the flag cardTextScan from the FEATURE map', () => {
    expect(FEATURE.cardTextScan).toBe('cardTextScan');
  });

  it('is offered with the flag on and the reader in the build', async () => {
    flags(true);
    getDeviceOcrProvider(() => reader);
    const { wrapper } = setup();
    const { result } = renderHook(() => useCardScanAvailability(), { wrapper });
    expect(result.current).toEqual({ available: false, known: false });
    await waitFor(() => expect(result.current).toEqual({ available: true, known: true }));
  });

  it.each([
    ['off', false],
    ['unknown', undefined],
  ])('is not offered with the flag %s', async (_label, value) => {
    const api = flags(value);
    getDeviceOcrProvider(() => reader);
    const { wrapper } = setup();
    const { result } = renderHook(() => useCardScanAvailability(), { wrapper });
    await waitFor(() => expect(result.current.known).toBe(true));
    expect(result.current.available).toBe(false);
    expect(api.callsTo('GET /api/v1/public/feature-flags').length).toBeGreaterThan(0);
  });

  it('is not offered without the reader (Expo Go, the web), whatever the flag says', async () => {
    const api = flags(true);
    const { wrapper } = setup();
    const { result } = renderHook(() => useCardScanAvailability(), { wrapper });
    expect(result.current).toEqual({ available: false, known: true });
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/public/feature-flags').length).toBeGreaterThan(0)
    );
    expect(result.current).toEqual({ available: false, known: true });
  });
});
