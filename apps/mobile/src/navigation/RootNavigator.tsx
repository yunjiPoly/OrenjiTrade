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
        <Stack.Screen name="binders/[id]" options={{ title: 'Binder' }} />
        <Stack.Screen name="binders/new" options={{ title: 'New binder' }} />
        <Stack.Screen name="binders/edit" options={{ title: 'Edit binder' }} />
        {/* Inventory items (web: the add dialog and the edit panel of /inventory). */}
        <Stack.Screen name="items/new" options={{ title: 'Add a card' }} />
        <Stack.Screen name="items/[id]" options={{ title: 'Card' }} />
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
        {/* Offers and trades (Phase 8; web: /offers, /offers/:id, the offer dialog, /trades). */}
        <Stack.Screen name="offers/index" options={{ title: 'Offers' }} />
        <Stack.Screen name="offers/[id]" options={{ title: 'Offer' }} />
        <Stack.Screen name="offers/new" options={{ title: 'Make an offer' }} />
        <Stack.Screen name="offers/counter" options={{ title: 'Counter-offer' }} />
        <Stack.Screen name="trades/index" options={{ title: 'Trades' }} />
        <Stack.Screen name="trades/[id]" options={{ title: 'Trade' }} />
        <Stack.Screen name="settings/offers" options={{ title: 'Offer settings' }} />
        {/* Payment protection (Phase 9; web: the trade page steps, /checkout/fake/:ref,
            /disputes/:id, /settings/payouts). */}
        <Stack.Screen name="checkout/fake/[ref]" options={{ title: 'Checkout' }} />
        <Stack.Screen name="disputes/[id]" options={{ title: 'Dispute' }} />
        <Stack.Screen name="settings/payouts" options={{ title: 'Payouts' }} />
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
