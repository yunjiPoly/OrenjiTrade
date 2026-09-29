import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { connectQueryManagers, queryClient } from '@/src/api/queryClient';
import { SessionProvider } from '@/src/auth/SessionProvider';
import { OfflineBanner } from '@/src/components/OfflineBanner';
import { ThemeProvider } from '@/src/theme/ThemeProvider';

export {
  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  useEffect(() => {
    const disconnect = connectQueryManagers();
    SplashScreen.hideAsync().catch(() => undefined);
    return disconnect;
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ThemeProvider>
            <OfflineBanner />
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="collectors/[id]" options={{ title: 'Collector' }} />
              <Stack.Screen name="cards/[id]" options={{ title: 'Card' }} />
              <Stack.Screen name="binders/[id]" options={{ title: 'Binder' }} />
            </Stack>
          </ThemeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
