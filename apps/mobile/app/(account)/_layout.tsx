import { Stack } from 'expo-router';

import { ACCOUNT_SCREEN_TITLES } from '@/src/navigation/backTitles';
import { headerTitleFont } from '@/src/theme/fonts';
import { useTheme } from '@/src/theme/useTheme';

/**
 * Account-state screens (web: `/auth/verify-email`, `/auth/consent`, `/auth/suspended`): the auth
 * gate sends a signed-in collector here while terms must be accepted, while the account is
 * suspended or leaving, or while `/me` cannot be loaded.
 */
export default function AccountLayout() {
  const { palette } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.ink,
        // Screen titles in Sora, as everywhere else (stage R12; RootNavigator).
        headerTitleStyle: headerTitleFont(),
        headerShadowVisible: false,
        headerTitleAlign: 'center',
        headerBackVisible: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Screen
        name="verify-email"
        options={{ title: ACCOUNT_SCREEN_TITLES['verify-email'] }}
      />
      <Stack.Screen name="consent" options={{ title: ACCOUNT_SCREEN_TITLES.consent }} />
      <Stack.Screen name="suspended" options={{ title: ACCOUNT_SCREEN_TITLES.suspended }} />
      <Stack.Screen name="unavailable" options={{ title: ACCOUNT_SCREEN_TITLES.unavailable }} />
    </Stack>
  );
}
