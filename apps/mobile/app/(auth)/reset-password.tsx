import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { validateEmail } from '@/src/account/registration';
import { authErrorMessage, toAuthError } from '@/src/auth/authErrors';
import { useSession } from '@/src/auth/session';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { Screen } from '@/src/components/ui/Screen';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { StatusPage, StatusText } from '@/src/features/account/StatusPage';
import { RESET_COPY } from '@/src/features/auth/authCopy';
import { useResendCooldown } from '@/src/features/auth/resendCooldown';
import { fontWeight, spacing, textStyle, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

/**
 * 38 Reset password (stage R12, mockup v50): sends a Firebase password-reset email, then the sent
 * state in place ("Check your inbox", "Back to sign in", "Resend email" then "Resend in {n} s" for
 * 30 s after each email, as 39 Verify your email; "Use another email"). Neither the confirmation
 * nor a resend reveals whether an account exists for the address (web: `/auth/reset-password`).
 */
export default function ResetPasswordScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, startCooldown] = useResendCooldown();
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);

  const emailError = submitted ? validateEmail(email) : null;

  const onSubmit = async () => {
    setSubmitted(true);
    if (validateEmail(email)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await session.sendPasswordReset(email);
      showSent(email.trim());
    } catch (caught) {
      // Unknown addresses are not an error worth revealing.
      if (toAuthError(caught).code === 'auth/user-not-found') {
        showSent(email.trim());
      } else {
        setError(authErrorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  };

  const showSent = (address: string) => {
    setSentTo(address);
    setNotice(null);
    startCooldown();
  };

  const resend = async (address: string) => {
    setResending(true);
    setNotice(null);
    try {
      await session.sendPasswordReset(address);
      setNotice({ text: RESET_COPY.resent(address), tone: 'success' });
      startCooldown();
    } catch (caught) {
      if (toAuthError(caught).code === 'auth/user-not-found') {
        setNotice({ text: RESET_COPY.resent(address), tone: 'success' });
        startCooldown();
      } else {
        setNotice({ text: authErrorMessage(caught), tone: 'error' });
      }
    } finally {
      setResending(false);
    }
  };

  if (sentTo) {
    return (
      <StatusPage
        icon="email-check-outline"
        tone="accent"
        iconSize={64}
        title={RESET_COPY.sentTitle}
        testID="screen-reset-password"
        actions={
          <>
            <PillButton
              label={RESET_COPY.backToSignIn}
              onPress={() => router.replace('/sign-in')}
              testID="reset-back-to-sign-in"
            />
            <PillButton
              label={cooldown > 0 ? RESET_COPY.resendIn(cooldown) : RESET_COPY.resend}
              variant="outline"
              loading={resending}
              disabled={cooldown > 0}
              onPress={() => void resend(sentTo)}
              testID="reset-resend"
            />
            <PillButton
              label={RESET_COPY.anotherEmail}
              variant="quiet"
              onPress={() => {
                setSentTo(null);
                setNotice(null);
              }}
              testID="reset-another-email"
            />
          </>
        }
      >
        <StatusText testID="reset-sent">{RESET_COPY.sentText(sentTo)}</StatusText>
        {notice ? (
          <FormMessage tone={notice.tone} style={styles.notice} testID="reset-message">
            {notice.text}
          </FormMessage>
        ) : null}
      </StatusPage>
    );
  }

  return (
    <Screen
      scroll
      safeBottom
      keyboardFollowsFocus
      testID="screen-reset-password"
      contentContainerStyle={styles.page}
    >
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[textStyle('2xl', 'heading'), styles.title, { color: palette.ink }]}
        >
          {RESET_COPY.title}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{RESET_COPY.intro}</Text>
      </View>
      <View style={styles.form}>
        {error ? <FormMessage>{error}</FormMessage> : null}
        <TextField
          label={RESET_COPY.email}
          value={email}
          onChangeText={setEmail}
          error={emailError}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          onSubmitEditing={() => void onSubmit()}
          testID="reset-email"
        />
        <PillButton
          label={RESET_COPY.submit}
          loading={busy}
          loadingLabel={RESET_COPY.submitting}
          onPress={() => void onSubmit()}
          testID="reset-submit"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing[5], paddingTop: spacing[1] },
  header: { gap: 6, marginBottom: spacing[4] },
  title: { fontWeight: fontWeight.bold, letterSpacing: -0.3 },
  form: { gap: spacing[4] },
  notice: { alignSelf: 'stretch' },
});
