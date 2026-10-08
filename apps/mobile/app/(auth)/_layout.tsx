import { Stack } from 'expo-router';

import { useTheme } from '@/src/theme/useTheme';

/** Signed-out screens. The auth gate keeps signed-in collectors out of this group. */
export default function AuthLayout() {
  const { palette } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.ink,
        headerShadowVisible: false,
        headerTitleAlign: 'center',
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Screen name="sign-in" options={{ title: 'Sign in', headerShown: false }} />
      <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
      <Stack.Screen name="reset-password" options={{ title: 'Reset password' }} />
    </Stack>
  );
}
