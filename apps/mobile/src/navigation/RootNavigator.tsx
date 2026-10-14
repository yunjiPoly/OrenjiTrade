import { Stack } from 'expo-router';
import { getFocusedRouteNameFromRoute } from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFlowLock } from '@/src/account/flowLock';
import { useAuthGate } from '@/src/account/useAuthGate';
import { BootScreen } from '@/src/components/BootScreen';
import { useTheme } from '@/src/theme/useTheme';

import { groupTitleOptions, type RouteGroup } from './backTitles';
import { nativeHeaderInsetOptions } from './headerInsets';

type GroupRoute = Parameters<typeof getFocusedRouteNameFromRoute>[0];

/**
 * Options of a route group of the root stack: no header of its own, and on iOS the title of its
 * focused screen, which the back button of the screen opened over it shows (backTitles.ts).
 */
function groupOptions(group: RouteGroup, extra: { animation?: 'fade' } = {}) {
  return ({ route }: { route: GroupRoute }) => ({
    headerShown: false,
    ...extra,
    ...groupTitleOptions(Platform.OS, group, getFocusedRouteNameFromRoute(route)),
  });
}

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
        <Stack.Screen name="(tabs)" options={groupOptions('(tabs)')} />
        <Stack.Screen name="(auth)" options={groupOptions('(auth)', { animation: 'fade' })} />
        <Stack.Screen name="(account)" options={groupOptions('(account)', { animation: 'fade' })} />
        <Stack.Screen name="onboarding" options={{ title: 'Welcome', animation: 'fade' }} />
        {/* Settings (web: /settings/*). */}
        <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
        <Stack.Screen name="settings/profile" options={{ title: 'Edit profile' }} />
        <Stack.Screen name="settings/location" options={{ title: 'Location' }} />
        <Stack.Screen name="settings/privacy" options={{ title: 'Privacy' }} />
        <Stack.Screen name="settings/notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="settings/account" options={{ title: 'Account' }} />
        <Stack.Screen name="settings/blocked" options={{ title: 'Blocked users' }} />
        <Stack.Screen name="settings/delete-account" options={{ title: 'Delete account' }} />
        <Stack.Screen name="settings/appearance" options={{ title: 'Appearance' }} />
        {/* Legal pages: readable from every gate (signed out, consent, suspended, app). */}
        <Stack.Screen name="legal/index" options={{ title: 'Legal' }} />
        <Stack.Screen name="legal/[key]" options={{ title: 'Legal' }} />
        <Stack.Screen name="collectors/[id]" options={{ title: 'Collector' }} />
        <Stack.Screen name="cards/[id]" options={{ title: 'Card' }} />
        {/* "Who has this in my region" as a list (web: /search?card=) and a set's cards (web: /sets/:id). */}
        <Stack.Screen name="holders" options={{ title: 'Card holders' }} />
        <Stack.Screen name="sets/[id]" options={{ title: 'Set' }} />
        {/* The public binders of a state or province, opened from the Map tab (web: the state
            panel of /map?region=&subdivision=). The screen sets its own title: the place. */}
        <Stack.Screen name="regions/[region]/[code]" options={{ title: 'Binders' }} />
        <Stack.Screen name="binders/[id]" options={{ title: 'Binder' }} />
        <Stack.Screen name="binders/new" options={{ title: 'New binder' }} />
        <Stack.Screen name="binders/edit" options={{ title: 'Edit binder' }} />
        {/* Inventory items (web: the add dialog and the edit panel of /inventory). */}
        <Stack.Screen name="items/new" options={{ title: 'Add a card' }} />
        <Stack.Screen name="items/[id]" options={{ title: 'Card' }} />
        {/* Inventory import (stage S5): a YDK deck file or a Collectr CSV export, previewed and
            committed. Web: a recorded follow-up. */}
        <Stack.Screen name="items/import" options={{ title: 'Import cards' }} />
        {/* A conversation (from the inbox, a collector, a holder or a notification). */}
        <Stack.Screen name="messages/[id]" options={{ title: 'Conversation' }} />
        {/* A public community channel (web: /community/:slug; the list is in the Messages tab). */}
        <Stack.Screen name="community/[slug]" options={{ title: 'Community' }} />
        {/* Wishlist (web: the add/edit dialog). */}
        <Stack.Screen name="wishlist/new" options={{ title: 'Add to wishlist' }} />
        <Stack.Screen name="wishlist/edit" options={{ title: 'Edit wish' }} />
        {/* The notification centre (web: the top-bar bell and /notifications). */}
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        {/* Ratings, references and collector reports (Phase 7; web: their dialogs). */}
        <Stack.Screen name="report" options={{ title: 'Report collector' }} />
        <Stack.Screen name="ratings/rate" options={{ title: 'Rate' }} />
        <Stack.Screen name="ratings/reference" options={{ title: 'Write a reference' }} />
        <Stack.Screen name="settings/reports" options={{ title: 'My reports' }} />
        {/* Premium, credits and donations (Phase 10; web: /premium, /credits, /support and the
            fake billing / donation checkouts). */}
        <Stack.Screen name="premium" options={{ title: 'Premium' }} />
        <Stack.Screen name="checkout/fake-billing/[ref]" options={{ title: 'Premium checkout' }} />
        <Stack.Screen name="credits" options={{ title: 'Credits' }} />
        <Stack.Screen name="support" options={{ title: 'Support OrenjiTrade' }} />
        <Stack.Screen
          name="checkout/fake-donation/[ref]"
          options={{ title: 'Donation checkout' }}
        />
      </Stack>
      {/* A multi-step flow (sign-up) keeps its own progress on screen while `/me` waits. */}
      {gate === 'boot' && !flowLocked ? <BootScreen /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
