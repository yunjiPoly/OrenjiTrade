import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFlowLock } from '@/src/account/flowLock';
import { useAuthGate } from '@/src/account/useAuthGate';
import { BootScreen } from '@/src/components/BootScreen';
import { useTheme } from '@/src/theme/useTheme';

import { nativeHeaderInsetOptions } from './headerInsets';

/**
 * The root stack with the auth gate (signed out → sign-in, account states, onboarding, tabs).
 * While the gate boots, the native splash stays up and the web build shows `BootScreen`.
 */
export function RootNavigator() {
  const gate = useAuthGate();
  const flowLocked = useFlowLock((store) => store.lockedBy !== null);
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (gate !== 'boot') {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [gate]);

  return (
    <View style={styles.fill}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.surface },
          headerTintColor: palette.ink,
          headerShadowVisible: false,
          headerTitleAlign: 'center',
          contentStyle: { backgroundColor: palette.background },
          ...nativeHeaderInsetOptions(Platform.OS, insets.top),
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="(account)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="onboarding" options={{ title: 'Welcome', animation: 'fade' }} />
        {/* Settings (web: /settings/*). Later phases add offers, payouts, blocked users, ... */}
        <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
        <Stack.Screen name="settings/profile" options={{ title: 'Edit profile' }} />
        <Stack.Screen name="settings/location" options={{ title: 'Location' }} />
        <Stack.Screen name="settings/privacy" options={{ title: 'Privacy' }} />
        <Stack.Screen name="settings/notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="settings/account" options={{ title: 'Account' }} />
        <Stack.Screen name="settings/delete-account" options={{ title: 'Delete account' }} />
        <Stack.Screen name="settings/appearance" options={{ title: 'Appearance' }} />
        {/* Legal pages: readable from every gate (signed out, consent, suspended, app). */}
        <Stack.Screen name="legal/index" options={{ title: 'Legal' }} />
        <Stack.Screen name="legal/[key]" options={{ title: 'Legal' }} />
        <Stack.Screen name="collectors/[id]" options={{ title: 'Collector' }} />
        <Stack.Screen name="cards/[id]" options={{ title: 'Card' }} />
        <Stack.Screen name="binders/[id]" options={{ title: 'Binder' }} />
        <Stack.Screen name="binders/new" options={{ title: 'New binder' }} />
        <Stack.Screen name="binders/edit" options={{ title: 'Edit binder' }} />
        {/* Inventory items (web: the add dialog and the edit panel of /inventory). */}
        <Stack.Screen name="items/new" options={{ title: 'Add a card' }} />
        <Stack.Screen name="items/[id]" options={{ title: 'Card' }} />
      </Stack>
      {/* A multi-step flow (sign-up) keeps its own progress on screen while `/me` waits. */}
      {gate === 'boot' && !flowLocked ? <BootScreen /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
