import { Stack } from 'expo-router';

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
        headerShadowVisible: false,
        headerTitleAlign: 'center',
        headerBackVisible: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Screen name="verify-email" options={{ title: 'Verify your email' }} />
      <Stack.Screen name="consent" options={{ title: 'Review our terms' }} />
      <Stack.Screen name="suspended" options={{ title: 'Account status' }} />
      <Stack.Screen name="unavailable" options={{ title: 'OrenjiTrade' }} />
    </Stack>
  );
}
