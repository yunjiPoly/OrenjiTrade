import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useFlowLock } from '@/src/account/flowLock';
import { homeFor } from '@/src/account/gate';
import { authErrorMessage } from '@/src/auth/authErrors';
import { useSession } from '@/src/auth/session';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { Text } from '@/src/components/ui/Text';
import { StatusPage, StatusText } from '@/src/features/account/StatusPage';
import { VERIFY_COPY } from '@/src/features/auth/authCopy';
import { useResendCooldown } from '@/src/features/auth/resendCooldown';
import { fontWeight, useTheme } from '@/src/theme';

/**
 * 39 Verify your email (stage R12, mockup v50): "Check your inbox", then confirm the address
 * (reloads the Firebase user and `/me`), resend the email ("Resend in {n} s" for 30 s after a
 * resend) or continue and verify later (web: `/auth/verify-email`). The notices show in place.
 * Releases the sign-up gate lock.
 */
export default function VerifyEmailScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  const account = useAccount();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, startCooldown] = useResendCooldown();
  const [message, setMessage] = useState<{
    text: string;
    tone: 'warning' | 'success' | 'error';
  } | null>(null);

  useEffect(() => {
    useFlowLock.getState().unlock();
  }, []);

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
        setMessage({ text: VERIFY_COPY.notYet, tone: 'warning' });
      }
    } catch (caught) {
      setMessage({ text: authErrorMessage(caught), tone: 'error' });
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setMessage(null);
    try {
      await session.sendEmailVerification();
      setMessage({ text: VERIFY_COPY.resent, tone: 'success' });
      startCooldown();
    } catch (caught) {
      setMessage({ text: authErrorMessage(caught), tone: 'error' });
    } finally {
      setResending(false);
    }
  };

  if (verified) {
    return (
      <StatusPage
        icon="email-check-outline"
        tone="accent"
        title={VERIFY_COPY.title}
        testID="screen-verify-email"
        actions={
          <PillButton label={VERIFY_COPY.continue} onPress={proceed} testID="verify-continue" />
        }
      >
        <StatusText>{VERIFY_COPY.verified}</StatusText>
      </StatusPage>
    );
  }

  return (
    <StatusPage
      icon="email-outline"
      tone="primary"
      title={VERIFY_COPY.title}
      testID="screen-verify-email"
      actions={
        <>
          <PillButton
            label={VERIFY_COPY.check}
            loading={checking}
            onPress={() => void checkVerified()}
            testID="verify-check"
          />
          <PillButton
            label={cooldown > 0 ? VERIFY_COPY.resendIn(cooldown) : VERIFY_COPY.resend}
            variant="outline"
            loading={resending}
            disabled={cooldown > 0}
            onPress={() => void resend()}
            testID="verify-resend"
          />
          <PillButton
            label={VERIFY_COPY.later}
            variant="quiet"
            onPress={proceed}
            testID="verify-later"
          />
        </>
      }
    >
      <StatusText>
        {VERIFY_COPY.sentBefore}
        <Text style={[styles.strong, { color: palette.ink }]}>
          {session.user?.email ?? VERIFY_COPY.yourAddress}
        </Text>
        {VERIFY_COPY.sentAfter}
      </StatusText>
      {session.usesEmulator ? (
        <FormMessage tone="info" style={styles.notice}>
          {VERIFY_COPY.emulator}
        </FormMessage>
      ) : null}
      {message ? (
        <FormMessage tone={message.tone} style={styles.notice} testID="verify-message">
          {message.text}
        </FormMessage>
      ) : null}
    </StatusPage>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: fontWeight.semibold },
  notice: { alignSelf: 'stretch' },
});
