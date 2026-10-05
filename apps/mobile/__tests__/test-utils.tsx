import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountProvider } from '@/src/account/AccountProvider';
import { useFlowLock } from '@/src/account/flowLock';
import { usePendingLink } from '@/src/account/pendingLink';
import { useSessionNotice } from '@/src/auth/sessionNotice';
import { clearAccountSignal } from '@/src/api/accountSignal';
import type { AuthPort } from '@/src/auth/authPort';
import { SessionProvider } from '@/src/auth/session';
import { SnackbarProvider } from '@/src/components/ui/Snackbar';
import { ThemeProvider } from '@/src/theme/ThemeProvider';
import type { ColorScheme } from '@/src/theme/palette';

import { FakeAuthPort } from './support/fakeAuthPort';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      // gcTime Infinity: no garbage-collection timers keep the jest worker alive after a test.
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

export interface ProvidersProps {
  children: ReactNode;
  scheme?: ColorScheme;
  queryClient?: QueryClient;
  /** The Firebase stand-in; anonymous by default. */
  port?: AuthPort;
}

/** Everything the app root provides: query client, session, account, theme, snackbar. */
export function TestProviders({ children, scheme = 'light', queryClient, port }: ProvidersProps) {
  const client = queryClient ?? createTestQueryClient();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <SessionProvider port={port ?? new FakeAuthPort()}>
          <AccountProvider>
            <ThemeProvider scheme={scheme}>
              <SnackbarProvider>{children}</SnackbarProvider>
            </ThemeProvider>
          </AccountProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  {
    scheme,
    queryClient,
    port,
    ...options
  }: Omit<RenderOptions, 'wrapper'> & Omit<ProvidersProps, 'children'> = {}
) {
  const client = queryClient ?? createTestQueryClient();
  const result = render(ui, {
    ...options,
    wrapper: ({ children }) => (
      <TestProviders scheme={scheme} queryClient={client} port={port}>
        {children}
      </TestProviders>
    ),
  });
  return { ...result, queryClient: client };
}

/** Resets module-level state shared between tests (signals, locks, pending link, notices). */
export function resetAppState(): void {
  clearAccountSignal();
  useFlowLock.getState().unlock();
  usePendingLink.getState().clear();
  useSessionNotice.getState().clear();
}
