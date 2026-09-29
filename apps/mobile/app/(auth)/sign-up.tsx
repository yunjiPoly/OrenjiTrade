import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { Screen } from '@/src/components/ui/Screen';
import { TextField } from '@/src/components/ui/TextField';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sign-up placeholder: local validation only; account creation is wired in Phase 1. */
export default function SignUpScreen() {
  const { palette } = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const errors = {
    displayName:
      submitted && displayName.trim().length < 2 ? 'Choose a display name (2+ characters).' : null,
    email: submitted && !EMAIL_PATTERN.test(email) ? 'Enter a valid email address.' : null,
    password: submitted && password.length < 8 ? 'Password must be at least 8 characters.' : null,
    confirm: submitted && confirm !== password ? 'Passwords do not match.' : null,
  };

  const onSubmit = () => {
    setSubmitted(true);
    if (
      displayName.trim().length < 2 ||
      !EMAIL_PATTERN.test(email) ||
      password.length < 8 ||
      confirm !== password
    ) {
      return;
    }
    setNotice('Account creation is not connected yet. Firebase Authentication arrives in Phase 1.');
  };

  return (
    <Screen scroll safeBottom testID="screen-sign-up">
      <View style={styles.header}>
        <Text style={[textStyle('2xl', 'heading'), styles.title, { color: palette.ink }]}>
          Join the network
        </Text>
        <Text style={[textStyle('md'), { color: palette.textMuted }]}>
          You stay hidden on the map until you choose a trading area and opt in.
        </Text>
      </View>

      <View style={styles.form}>
        <TextField
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          error={errors.displayName}
          hint="Shown to other collectors instead of your real name."
          autoComplete="username"
          testID="sign-up-display-name"
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          testID="sign-up-email"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          testID="sign-up-password"
        />
        <TextField
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          error={errors.confirm}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          testID="sign-up-confirm"
        />
        <Button label="Create account" onPress={onSubmit} testID="sign-up-submit" />
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
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          Already have an account?
        </Text>
        <Link
          href="/(auth)/sign-in"
          replace
          style={[textStyle('sm'), styles.link, { color: palette.accent }]}
        >
          Sign in
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing[2], marginBottom: spacing[6] },
  title: { fontWeight: fontWeight.bold },
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
