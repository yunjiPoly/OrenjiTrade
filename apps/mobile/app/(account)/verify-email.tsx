import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useFlowLock } from '@/src/account/flowLock';
import { homeFor } from '@/src/account/gate';
import { authErrorMessage } from '@/src/auth/authErrors';
import { useSession } from '@/src/auth/session';
import { Button } from '@/src/components/ui/Button';
import { FormMessage } from '@/src/components/ui/FormControls';
import { Screen } from '@/src/components/ui/Screen';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export const RESEND_COOLDOWN_S = 30;

/**
 * "Check your inbox": resend the verification email, confirm it (reloads the Firebase user and
 * `/me`) or continue and verify later (web: `/auth/verify-email`). Releases the sign-up gate lock.
 */
export default function VerifyEmailScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  const account = useAccount();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    useFlowLock.getState().unlock();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) {
      return undefined;
    }
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verified = session.user?.emailVerified ?? false;
  const proceed = () => router.dismissTo(homeFor(account.status, account.needsOnboarding));

  const checkVerified = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const user = await session.reloadUser();
      if (user?.emailVerified) {
        await account.reload();
        proceed();
      } else {
        setMessage({
          text: 'We do not see the verification yet. Open the link, then try again.',
          error: false,
        });
      }
    } catch (caught) {
      setMessage({ text: authErrorMessage(caught), error: true });
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setMessage(null);
    try {
      await session.sendEmailVerification();
      setMessage({ text: 'A new verification email is on its way.', error: false });
      setCooldown(RESEND_COOLDOWN_S);
    } catch (caught) {
      setMessage({ text: authErrorMessage(caught), error: true });
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen scroll safeBottom testID="screen-verify-email">
      <Text
        accessibilityRole="header"
        style={[textStyle('2xl', 'heading'), styles.title, { color: palette.ink }]}
      >
        Check your inbox
      </Text>
      {verified ? (
        <View style={styles.body}>
          <FormMessage tone="success">Your email address is verified. Thanks!</FormMessage>
          <Button label="Continue" onPress={proceed} testID="verify-continue" />
        </View>
      ) : (
        <View style={styles.body}>
          <View style={[styles.art, { backgroundColor: palette.primaryContainer }]}>
            <MaterialCommunityIcons name="email-alert-outline" size={36} color={palette.primary} />
          </View>
          <Text style={[textStyle('md'), { color: palette.ink }]}>
            We sent a verification link to{' '}
            <Text style={styles.strong}>{session.user?.email ?? 'your email address'}</Text>. Open
            it to confirm the address, then come back here.
          </Text>
          {session.usesEmulator ? (
            <FormMessage tone="info">
              Local development: no real email is sent. The Firebase Auth emulator lists the link in
              its logs and in the Emulator UI (Authentication tab).
            </FormMessage>
          ) : null}
          {message ? (
            <FormMessage tone={message.error ? 'error' : 'info'} testID="verify-message">
              {message.text}
            </FormMessage>
          ) : null}
          <Button
            label="I have verified my email"
            loading={checking}
            onPress={() => void checkVerified()}
            testID="verify-check"
          />
          <Button
            label={cooldown > 0 ? `Resend in ${cooldown} s` : 'Resend email'}
            variant="secondary"
            icon="email-sync-outline"
            loading={resending}
            disabled={cooldown > 0}
            onPress={() => void resend()}
            testID="verify-resend"
          />
          <Button label="Do this later" variant="ghost" onPress={proceed} testID="verify-later" />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: fontWeight.bold, marginBottom: spacing[4] },
  body: { gap: spacing[4] },
  strong: { fontWeight: fontWeight.semibold },
  art: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
