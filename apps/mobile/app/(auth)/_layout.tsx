import { Stack } from 'expo-router';

import { AUTH_SCREEN_TITLES } from '@/src/navigation/backTitles';
import { headerTitleFont } from '@/src/theme/fonts';
import { useTheme } from '@/src/theme/useTheme';

/** Signed-out screens. The auth gate keeps signed-in collectors out of this group. */
export default function AuthLayout() {
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
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Screen
        name="sign-in"
        options={{ title: AUTH_SCREEN_TITLES['sign-in'], headerShown: false }}
      />
      <Stack.Screen name="sign-up" options={{ title: AUTH_SCREEN_TITLES['sign-up'] }} />
      <Stack.Screen
        name="reset-password"
        options={{ title: AUTH_SCREEN_TITLES['reset-password'] }}
      />
    </Stack>
  );
}
