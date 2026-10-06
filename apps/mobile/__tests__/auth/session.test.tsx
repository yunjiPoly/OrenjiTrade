import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useAccountSignalStore } from '@/src/api/accountSignal';
import { AuthError } from '@/src/auth/authErrors';
import { AUTH_READY_TIMEOUT_MS, SessionProvider, useSession } from '@/src/auth/session';
import { useSessionNotice } from '@/src/auth/sessionNotice';
import { getIdToken } from '@/src/auth/tokenProvider';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { createTestQueryClient } from '../test-utils';

function setup(port: FakeAuthPort) {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SessionProvider port={port}>{children}</SessionProvider>
    </QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => useSession(), { wrapper }) };
}

describe('SessionProvider', () => {
  it('restores a persisted session on launch and bridges the ID token to the API client', async () => {
    const port = new FakeAuthPort(testUser());
    const { result } = setup(port);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user?.email).toBe('maika@example.test');
    expect(result.current.usesEmulator).toBe(true);
    await expect(getIdToken()).resolves.toBe('token-uid-maika-1');
    await expect(getIdToken(true)).resolves.toBe('token-uid-maika-2');
  });

  it('is anonymous when nobody is signed in, and after a slow restore', async () => {
    jest.useFakeTimers();
    try {
      const port = new FakeAuthPort(null);
      port.subscribe.mockImplementationOnce(() => () => undefined);
      const { result } = setup(port);
      expect(result.current.status).toBe('loading');
      act(() => {
        jest.advanceTimersByTime(AUTH_READY_TIMEOUT_MS);
      });
      expect(result.current.status).toBe('anonymous');
    } finally {
      jest.useRealTimers();
    }
  });

  it('signs in with a trimmed email and surfaces friendly errors', async () => {
    const port = new FakeAuthPort(null);
    const { result } = setup(port);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));

    await expect(result.current.signIn('maika@example.test', 'nope')).rejects.toThrow(
      'No account matches these credentials.'
    );
    await act(async () => {
      await result.current.signIn('  maika@example.test ', 'correct-password');
    });
    expect(port.signIn).toHaveBeenLastCalledWith('maika@example.test', 'correct-password');
    expect(result.current.status).toBe('authenticated');
  });

  it('signs up, stores the display name and refreshes the token before the account is provisioned', async () => {
    const port = new FakeAuthPort(null);
    const { result } = setup(port);
    await waitFor(() => expect(result.current.status).toBe('anonymous'));

    await act(async () => {
      await result.current.signUp('new@example.test', 'long-password', '  Nouvelle  ');
    });
    expect(port.updateDisplayName).toHaveBeenCalledWith('Nouvelle');
    expect(port.getIdToken).toHaveBeenCalledWith(true);
    expect(result.current.user?.displayName).toBe('Nouvelle');
  });

  it('drops cached data and account signals when the user signs out', async () => {
    const port = new FakeAuthPort(testUser());
    const { result, queryClient } = setup(port);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    queryClient.setQueryData(['me', 'uid-maika', 'profile'], { handle: 'maika' });
    useAccountSignalStore.getState().report({ kind: 'deletion-pending', at: 1 });

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.status).toBe('anonymous');
    expect(queryClient.getQueryData(['me', 'uid-maika', 'profile'])).toBeUndefined();
    expect(useAccountSignalStore.getState().signal).toBeNull();
  });

  it('signs out when the session ended on its own, until the collector signs in again', async () => {
    const port = new FakeAuthPort(testUser());
    const { result } = setup(port);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    act(() => useSessionNotice.getState().reportEnded());
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(port.signOut).toHaveBeenCalled();
    expect(useSessionNotice.getState().ended).toBe(true);
    await act(async () => {
      await result.current.signIn('maika@example.test', 'correct-password');
    });
    expect(result.current.status).toBe('authenticated');
    expect(useSessionNotice.getState().ended).toBe(false);
  });

  it('re-authenticates with the password, then refreshes the token', async () => {
    const port = new FakeAuthPort(testUser());
    const { result } = setup(port);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await expect(result.current.reauthenticate('wrong')).rejects.toBeInstanceOf(AuthError);
    await act(async () => {
      await result.current.reauthenticate('correct-password');
    });
    expect(port.getIdToken).toHaveBeenCalledWith(true);
  });

  it('reloads the user after the verification link was opened', async () => {
    const port = new FakeAuthPort(testUser({ emailVerified: false }));
    port.reload.mockResolvedValueOnce(testUser({ emailVerified: true }));
    const { result } = setup(port);
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => {
      await result.current.reloadUser();
    });
    expect(result.current.user?.emailVerified).toBe(true);
  });
});
