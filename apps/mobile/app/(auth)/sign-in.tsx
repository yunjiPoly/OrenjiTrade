import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { validateEmail } from '@/src/account/registration';
import { authErrorMessage } from '@/src/auth/authErrors';
import { SESSION_ENDED_MESSAGE, useSessionNotice } from '@/src/auth/sessionNotice';
import { useSession } from '@/src/auth/session';
import { Button } from '@/src/components/ui/Button';
import { FormMessage, PasswordField } from '@/src/components/ui/FormControls';
import { Screen } from '@/src/components/ui/Screen';
import { TextField } from '@/src/components/ui/TextField';
import { GoogleButton, OrDivider } from '@/src/features/auth/GoogleButton';
import { SimulatedGoogleAccountDialog } from '@/src/features/auth/SimulatedGoogleAccountDialog';
import { googleErrorMessage, useGoogleSignIn } from '@/src/features/auth/useGoogleSignIn';
import { useAppStore } from '@/src/store/useAppStore';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Sign in with email and password, or with Google (Firebase; the Auth emulator locally, where
 * Google is a simulated account). On success the auth gate takes over: consent, account status,
 * onboarding or the tabs (web: `/auth/sign-in`).
 */
export default function SignInScreen() {
  const { palette } = useTheme();
  const session = useSession();
  const lastSignedInEmail = useAppStore((state) => state.prefs.lastSignedInEmail);
  const sessionEnded = useSessionNotice((store) => store.ended);
  const updatePrefs = useAppStore((state) => state.updatePrefs);

  const [email, setEmail] = useState(lastSignedInEmail ?? '');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const google = useGoogleSignIn('sign-in');

  const emailError = submitted ? validateEmail(email) : null;
  const passwordError = submitted && !password ? 'Enter your password.' : null;

  const onSubmit = async () => {
    setSubmitted(true);
    if (validateEmail(email) || !password) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await session.signIn(email, password);
      updatePrefs({ lastSignedInEmail: email.trim() });
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setError(null);
    try {
      await google.start();
    } catch (caught) {
      setError(googleErrorMessage(caught));
    }
  };

  return (
    <Screen scroll safeBottom testID="screen-sign-in">
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          style={[textStyle('3xl', 'heading'), styles.wordmark]}
          accessibilityLabel="OrenjiTrade"
        >
          <Text style={{ color: palette.primary }}>Orenji</Text>
          <Text style={{ color: palette.ink }}>Trade</Text>
        </Text>
        <Text style={[textStyle('md'), { color: palette.textMuted }]}>
          Find collectors near you who own, trade or want the cards you care about.
        </Text>
      </View>

      <View style={styles.form}>
        <Text
          accessibilityRole="header"
          style={[textStyle('xl', 'heading'), styles.title, { color: palette.ink }]}
        >
          Sign in
        </Text>
        {session.initError ? (
          <FormMessage tone="info">Sign-in is not configured for this environment.</FormMessage>
        ) : null}
        {sessionEnded && !error ? (
          <FormMessage tone="info" testID="sign-in-session-ended">
            {SESSION_ENDED_MESSAGE}
          </FormMessage>
        ) : null}
        {error ? <FormMessage testID="sign-in-error">{error}</FormMessage> : null}
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={emailError}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          testID="sign-in-email"
        />
        <PasswordField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={passwordError}
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={() => void onSubmit()}
          testID="sign-in-password"
        />
        <Link
          href="/reset-password"
          style={[textStyle('sm'), styles.link, { color: palette.accent }]}
        >
          Forgot your password?
        </Link>
        <Button
          label="Sign in"
          loadingLabel="Signing in…"
          loading={busy}
          disabled={google.busy}
          onPress={() => void onSubmit()}
          testID="sign-in-submit"
        />
        <OrDivider />
        <GoogleButton
          busy={google.busy}
          disabled={busy || !!session.initError}
          onPress={() => void onGoogle()}
          testID="sign-in-google"
        />
      </View>
      <SimulatedGoogleAccountDialog {...google.dialog} />

      <View style={styles.footer}>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>New to OrenjiTrade?</Text>
        <Link href="/sign-up" style={[textStyle('sm'), styles.link, { color: palette.accent }]}>
          Create an account
        </Link>
      </View>
      <View style={styles.footer}>
        <Link href="/legal" style={[textStyle('xs'), { color: palette.textMuted }]}>
          Terms, privacy and community guidelines
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing[2], marginBottom: spacing[6], marginTop: spacing[6] },
  wordmark: { fontWeight: fontWeight.bold },
  title: { fontWeight: fontWeight.semibold },
  form: { gap: spacing[4] },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing[1],
    marginTop: spacing[6],
  },
  link: { fontWeight: fontWeight.semibold },
});
