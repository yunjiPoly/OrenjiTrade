import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useGuestAction } from '@/src/account/guestAction';
import { usePendingLink } from '@/src/account/pendingLink';
import { validateEmail } from '@/src/account/registration';
import { authErrorMessage } from '@/src/auth/authErrors';
import { SESSION_ENDED_MESSAGE, useSessionNotice } from '@/src/auth/sessionNotice';
import { useSession } from '@/src/auth/session';
import { FormMessage, PasswordField } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { Screen } from '@/src/components/ui/Screen';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { SIGN_IN_COPY } from '@/src/features/auth/authCopy';
import { GoogleButton, OrDivider } from '@/src/features/auth/GoogleButton';
import { SimulatedGoogleAccountDialog } from '@/src/features/auth/SimulatedGoogleAccountDialog';
import { googleErrorMessage, useGoogleSignIn } from '@/src/features/auth/useGoogleSignIn';
import { GUEST_COPY } from '@/src/features/guest/guestCopy';
import { useAppStore } from '@/src/store/useAppStore';
import {
  fontFamily,
  fontWeight,
  spacing,
  PINNED_MAX_FONT_SCALE,
  textStyle,
  useTheme,
} from '@/src/theme';

/**
 * 36 Sign in (stage R12, mockup v50): the close button ("Not now, keep browsing", stage R15: back
 * to where the guest was), the wordmark and its line, email, password with show and hide, "Forgot
 * your password?", Sign in, Google, "Create an account" and the legal pages. Email
 * and password or Google (Firebase; the Auth emulator locally, where Google is a simulated
 * account). On success the auth gate takes over: Review our terms, account status, the welcome
 * or the tabs (web: `/auth/sign-in`).
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
  const router = useRouter();

  const emailError = submitted ? validateEmail(email) : null;
  const passwordError = submitted && !password ? SIGN_IN_COPY.passwordMissing : null;

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

  /**
   * "Not now, keep browsing" (stage R15): back to where the guest was, Home when Sign in is all
   * there is; the screen and the action kept for after signing in are forgotten.
   */
  const close = () => {
    usePendingLink.getState().clear();
    useGuestAction.getState().dismiss();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
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
    <Screen
      scroll
      safeBottom
      fillHeight="full"
      keyboardFollowsFocus
      testID="screen-sign-in"
      contentContainerStyle={styles.page}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={GUEST_COPY.closeSignIn}
        onPress={close}
        hitSlop={4}
        testID="sign-in-close"
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="close" size={22} color={palette.ink} />
      </Pressable>
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          accessibilityLabel={SIGN_IN_COPY.wordmarkLabel}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.wordmark, { color: palette.ink }]}
        >
          Orenji<Text style={{ color: palette.primary }}>Trade</Text>
        </Text>
        <Text style={[textStyle('md'), styles.tagline, { color: palette.textMuted }]}>
          {SIGN_IN_COPY.tagline}
        </Text>
      </View>

      <View style={styles.form}>
        {session.initError ? (
          <FormMessage tone="info">{SIGN_IN_COPY.notConfigured}</FormMessage>
        ) : null}
        {sessionEnded && !error ? (
          <FormMessage tone="info" testID="sign-in-session-ended">
            {SESSION_ENDED_MESSAGE}
          </FormMessage>
        ) : null}
        {error ? <FormMessage testID="sign-in-error">{error}</FormMessage> : null}
        <TextField
          label={SIGN_IN_COPY.email}
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
          label={SIGN_IN_COPY.password}
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
          accessibilityRole="link"
          style={[textStyle('sm'), styles.forgot, { color: palette.accent }]}
          testID="sign-in-forgot"
        >
          {SIGN_IN_COPY.forgot}
        </Link>
        <PillButton
          label={SIGN_IN_COPY.submit}
          loadingLabel={SIGN_IN_COPY.submitting}
          loading={busy}
          disabled={google.busy}
          onPress={() => void onSubmit()}
          testID="sign-in-submit"
        />
        <OrDivider />
        <GoogleButton
          label={SIGN_IN_COPY.google}
          busy={google.busy}
          disabled={busy || !!session.initError}
          onPress={() => void onGoogle()}
          testID="sign-in-google"
        />
      </View>
      <SimulatedGoogleAccountDialog {...google.dialog} />

      <View style={styles.footer}>
        <View style={styles.newHere}>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            {SIGN_IN_COPY.newHere}
          </Text>
          <Link
            href="/sign-up"
            accessibilityRole="link"
            style={[textStyle('sm'), styles.create, { color: palette.primary }]}
            testID="sign-in-create-account"
          >
            {SIGN_IN_COPY.createAccount}
          </Link>
        </View>
        <Link
          href="/legal"
          accessibilityRole="link"
          style={[textStyle('xs'), styles.legal, { color: palette.textMuted }]}
          testID="sign-in-legal"
        >
          {SIGN_IN_COPY.legal}
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing[5] },
  // Mockup v50 (36): the close button top left, its cross on the margin of the words.
  close: {
    alignSelf: 'flex-start',
    marginTop: 10,
    marginLeft: -12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  header: { gap: 10, marginTop: spacing[2], marginBottom: spacing[6] },
  wordmark: {
    fontFamily: fontFamily.display,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
  },
  tagline: { maxWidth: 320 },
  form: { gap: 14 },
  forgot: {
    alignSelf: 'flex-end',
    marginTop: -4,
    paddingVertical: spacing[2],
    fontWeight: fontWeight.semibold,
  },
  footer: { marginTop: 'auto', paddingTop: spacing[8], alignItems: 'center', gap: 2 },
  newHere: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 6,
  },
  create: { fontWeight: fontWeight.bold, paddingVertical: spacing[3] },
  legal: { paddingVertical: spacing[2], textAlign: 'center' },
});
