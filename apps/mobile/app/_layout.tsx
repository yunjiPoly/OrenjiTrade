import { MaterialCommunityIcons } from '@expo/vector-icons';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountProvider } from '@/src/account/AccountProvider';
import { connectQueryManagers, queryClient } from '@/src/api/queryClient';
import { SessionProvider } from '@/src/auth/session';
import { OfflineBanner } from '@/src/components/OfflineBanner';
import { SnackbarProvider } from '@/src/components/ui/Snackbar';
import { RootNavigator } from '@/src/navigation/RootNavigator';
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
  useEffect(() => connectQueryManagers(), []);
  // The icon font is preloaded (not awaited): the web static render then embeds it, so the
  // server HTML and the first client render draw the same glyphs (no hydration mismatch), and
  // native screens do not flash empty icons.
  useFonts(MaterialCommunityIcons.font);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <AccountProvider>
            <ThemeProvider>
              <SnackbarProvider>
                <OfflineBanner />
                <RootNavigator />
              </SnackbarProvider>
            </ThemeProvider>
          </AccountProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
