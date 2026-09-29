import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/src/auth/SessionProvider';
import { ThemeProvider } from '@/src/theme/ThemeProvider';
import type { ColorScheme } from '@/src/theme/palette';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface ProvidersProps {
  children: ReactNode;
  scheme?: ColorScheme;
  queryClient?: QueryClient;
}

export function TestProviders({ children, scheme = 'light', queryClient }: ProvidersProps) {
  const client = queryClient ?? createTestQueryClient();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <SessionProvider>
          <ThemeProvider scheme={scheme}>{children}</ThemeProvider>
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
    ...options
  }: Omit<RenderOptions, 'wrapper'> & Omit<ProvidersProps, 'children'> = {}
) {
  return render(ui, {
    ...options,
    wrapper: ({ children }) => (
      <TestProviders scheme={scheme} queryClient={queryClient}>
        {children}
      </TestProviders>
    ),
  });
}
