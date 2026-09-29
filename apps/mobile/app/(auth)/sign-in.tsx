import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { Screen } from '@/src/components/ui/Screen';
import { TextField } from '@/src/components/ui/TextField';
import { useAppStore } from '@/src/store/useAppStore';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sign-in placeholder: validates the form locally; Firebase sign-in is wired in Phase 1. */
export default function SignInScreen() {
  const { palette } = useTheme();
  const lastSignedInEmail = useAppStore((state) => state.prefs.lastSignedInEmail);
  const updatePrefs = useAppStore((state) => state.updatePrefs);

  const [email, setEmail] = useState(lastSignedInEmail ?? '');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const emailError =
    submitted && !EMAIL_PATTERN.test(email) ? 'Enter a valid email address.' : null;
  const passwordError =
    submitted && password.length < 8 ? 'Password must be at least 8 characters.' : null;

  const onSubmit = () => {
    setSubmitted(true);
    if (!EMAIL_PATTERN.test(email) || password.length < 8) {
      return;
    }
    updatePrefs({ lastSignedInEmail: email.trim() });
    setNotice('Sign-in is not connected yet. Firebase Authentication arrives in Phase 1.');
  };

  return (
    <Screen scroll safeBottom testID="screen-sign-in">
      <View style={styles.header}>
        <Text style={[textStyle('3xl', 'heading'), styles.wordmark]}>
          <Text style={{ color: palette.primary }}>Orenji</Text>
          <Text style={{ color: palette.ink }}>Trade</Text>
        </Text>
        <Text style={[textStyle('md'), { color: palette.textMuted }]}>
          Find collectors near you who own, trade or want the cards you care about.
        </Text>
      </View>

      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={emailError}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          testID="sign-in-email"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={passwordError}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          testID="sign-in-password"
        />
        <Button label="Sign in" onPress={onSubmit} testID="sign-in-submit" />
        {notice ? (
          <Text
            accessibilityRole="alert"
            style={[textStyle('sm'), styles.notice, { color: palette.info }]}
          >
            {notice}
          </Text>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>New to OrenjiTrade?</Text>
        <Link
          href="/(auth)/sign-up"
          replace
          style={[textStyle('sm'), styles.link, { color: palette.accent }]}
        >
          Create an account
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing[2], marginBottom: spacing[8] },
  wordmark: { fontWeight: fontWeight.bold },
  form: { gap: spacing[4] },
  notice: { textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[1],
    marginTop: spacing[8],
  },
  link: { fontWeight: fontWeight.semibold },
});
