import { Stack } from 'expo-router';

import { useTheme } from '@/src/theme/useTheme';

/** Legal pages: readable from every gate (signed out, consent, suspended, app). */
export default function LegalLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Legal' }} />
      <Stack.Screen name="[key]" options={{ title: 'Legal' }} />
    </Stack>
  );
}
