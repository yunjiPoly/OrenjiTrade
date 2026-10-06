import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/src/api/ApiError';
import {
  paymentOutcome,
  useProviderCheckout,
  type ProviderCheckoutSource,
} from '@/src/features/checkout/useProviderCheckout';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { mockApi, ok } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { TestProviders, resetAppState } from '../test-utils';

const wrapper = ({ children }: { children: ReactNode }) => (
  <TestProviders port={new FakeAuthPort(testUser())}>{children}</TestProviders>
);

function source(
  reads: { status: string }[],
  send: ProviderCheckoutSource<{ status: string }>['send'] = jest.fn(async () => undefined)
): ProviderCheckoutSource<{ status: string }> {
  let index = 0;
  return {
    read: jest.fn(async () => {
      const value = reads[Math.min(index, reads.length - 1)] ?? { status: 'REQUIRES_ACTION' };
      index++;
      return value;
    }),
    send,
    outcomeOf: (value) => paymentOutcome(value),
  };
}

beforeEach(() => {
  resetAppState();
  mockApi(signedInRoutes({ 'GET /api/v1/public/feature-flags': ok({}) }));
});

describe('useProviderCheckout', () => {
  it('gives up after the polls with "pending" when the provider never answers', async () => {
    const checkout = source([{ status: 'REQUIRES_ACTION' }]);
    const { result } = renderHook(
      () => useProviderCheckout('payment', 'ref-1', checkout, { pollDelayMs: 1, maxPolls: 3 }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let outcome: string | null = null;
    await act(async () => {
      outcome = await result.current.confirm('SUCCEEDED');
    });
    expect(outcome).toBe('pending');
    expect(result.current.status).toBe('done');
    expect(result.current.outcome).toBe('pending');
    expect(checkout.read).toHaveBeenCalledTimes(4);
  });

  it('reads how it ended after a 409 and keeps the pay buttons after another refusal', async () => {
    const conflict = new ApiError({ status: 409, errorCode: 'CONFLICT', message: 'Not waiting' });
    const checkout = source(
      [{ status: 'REQUIRES_ACTION' }, { status: 'SECURED' }],
      jest.fn(async () => {
        throw conflict;
      })
    );
    const { result } = renderHook(() => useProviderCheckout('payment', 'ref-2', checkout), {
      wrapper,
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.confirm('SUCCEEDED');
    });
    expect(result.current.outcome).toBe('succeeded');

    const refused = new ApiError({
      status: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      message: 'Down',
    });
    const failing = source(
      [{ status: 'REQUIRES_ACTION' }],
      jest.fn(async () => {
        throw refused;
      })
    );
    const second = renderHook(() => useProviderCheckout('payment', 'ref-3', failing), { wrapper });
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    await act(async () => {
      expect(await second.result.current.confirm('SUCCEEDED')).toBeNull();
    });
    expect(second.result.current.status).toBe('ready');
    expect(second.result.current.error).toBe(refused);
  });
});
