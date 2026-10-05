import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { validateEmail } from '@/src/account/registration';
import { authErrorMessage, toAuthError } from '@/src/auth/authErrors';
import { useSession } from '@/src/auth/session';
import { Button } from '@/src/components/ui/Button';
import { FormMessage } from '@/src/components/ui/FormControls';
import { Screen } from '@/src/components/ui/Screen';
import { TextField } from '@/src/components/ui/TextField';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Sends a Firebase password-reset email. The confirmation never reveals whether an account
 * exists for the address (web: `/auth/reset-password`).
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
      setSentTo(email.trim());
    } catch (caught) {
      // Unknown addresses are not an error worth revealing.
      if (toAuthError(caught).code === 'auth/user-not-found') {
        setSentTo(email.trim());
      } else {
        setError(authErrorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll safeBottom testID="screen-reset-password">
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          style={[textStyle('2xl', 'heading'), styles.title, { color: palette.ink }]}
        >
          Reset your password
        </Text>
        <Text style={[textStyle('md'), { color: palette.textMuted }]}>
          We will email you a link to choose a new password.
        </Text>
      </View>
      {sentTo ? (
        <View style={styles.form}>
          <FormMessage tone="success" testID="reset-sent">
            If an account exists for {sentTo}, a reset link is on its way. Check your inbox and spam
            folder.
          </FormMessage>
          <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />
          <Button label="Use another email" variant="ghost" onPress={() => setSentTo(null)} />
        </View>
      ) : (
        <View style={styles.form}>
          {error ? <FormMessage>{error}</FormMessage> : null}
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
            testID="reset-email"
          />
          <Button
            label="Send reset link"
            loading={busy}
            loadingLabel="Sending…"
            onPress={() => void onSubmit()}
            testID="reset-submit"
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing[2], marginBottom: spacing[6] },
  title: { fontWeight: fontWeight.bold },
  form: { gap: spacing[4] },
});
