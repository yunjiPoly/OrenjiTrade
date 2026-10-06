import { Link, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useFlowLock } from '@/src/account/flowLock';
import {
  MIN_PASSWORD_LENGTH,
  hasErrors,
  register,
  requiredAtRegistration,
  validateSignUp,
  type RegistrationStep,
} from '@/src/account/registration';
import { isApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useLegalDocuments } from '@/src/api/hooks/legal';
import { authErrorMessage } from '@/src/auth/authErrors';
import { useSession } from '@/src/auth/session';
import { Button } from '@/src/components/ui/Button';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage, PasswordField } from '@/src/components/ui/FormControls';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { TextField } from '@/src/components/ui/TextField';
import { GoogleButton, OrDivider } from '@/src/features/auth/GoogleButton';
import { SimulatedGoogleAccountDialog } from '@/src/features/auth/SimulatedGoogleAccountDialog';
import { googleErrorMessage, useGoogleSignIn } from '@/src/features/auth/useGoogleSignIn';
import { LegalConsentList } from '@/src/features/legal/LegalConsentList';
import type { ConsentItem } from '@/src/features/legal/legalDocs';
import { legalKeyOf } from '@/src/features/legal/legalDocs';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

const STEP_LABELS: Record<RegistrationStep, string> = {
  account: 'Creating your account…',
  consents: 'Saving your consent…',
  verification: 'Sending the verification email…',
};

/**
 * Create an account: display name, email + password, acceptance of every legal document required
 * at registration (versions from the API, texts readable in-app), then a verification email
 * (web: `/auth/sign-up`). The auth gate is held until the consents are recorded. "Sign up with
 * Google" signs in with Google instead; the consent screen then collects the legal acceptance,
 * exactly like the web.
 */
export default function SignUpScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  const account = useAccount();
  const legal = useLegalDocuments();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState<RegistrationStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const google = useGoogleSignIn('sign-in');

  const documents = useMemo(() => requiredAtRegistration(legal.data ?? []), [legal.data]);
  const items = useMemo<ConsentItem[]>(
    () =>
      documents.map((document) => ({
        documentType: document.documentType,
        version: document.version,
        title: document.title,
        key: legalKeyOf(document.url),
      })),
    [documents]
  );

  const errors = validateSignUp(
    { displayName, email, password, acceptedDocumentTypes: accepted },
    documents
  );
  const shown = submitted ? errors : null;

  const onSubmit = async () => {
    setSubmitted(true);
    if (hasErrors(errors)) {
      return;
    }
    setError(null);
    const flowLock = useFlowLock.getState();
    flowLock.lock('sign-up');
    try {
      await register({ displayName, email, password }, documents, {
        signUp: (value, secret, name) => session.signUp(value, secret, name),
        currentEmail: () => session.user?.email ?? null,
        acceptConsents: account.acceptConsents,
        sendEmailVerification: session.sendEmailVerification,
        onStep: setStep,
      });
      // The verify-email screen releases the gate once it is shown.
      router.replace('/verify-email');
    } catch (caught) {
      flowLock.unlock();
      setError(isApiError(caught) ? friendlyMessage(caught) : authErrorMessage(caught));
    } finally {
      setStep(null);
    }
  };

  /** Google sign-up: the consent screen collects the legal acceptance afterwards (the gate). */
  const onGoogle = async () => {
    setError(null);
    try {
      await google.start();
    } catch (caught) {
      setError(googleErrorMessage(caught));
    }
  };

  return (
    <Screen scroll safeBottom testID="screen-sign-up">
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          style={[textStyle('2xl', 'heading'), styles.title, { color: palette.ink }]}
        >
          Create your account
        </Text>
        <Text style={[textStyle('md'), { color: palette.textMuted }]}>
          Join collectors trading near you. You stay hidden on the map until you opt in.
        </Text>
      </View>

      <View style={styles.form}>
        {session.initError ? (
          <FormMessage tone="info">Sign-up is not configured for this environment yet.</FormMessage>
        ) : null}
        {error ? <FormMessage testID="sign-up-error">{error}</FormMessage> : null}
        <TextField
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          error={shown?.displayName}
          hint="How other collectors see you. You can change it later."
          autoComplete="nickname"
          maxLength={80}
          testID="sign-up-display-name"
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={shown?.email}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          testID="sign-up-email"
        />
        <PasswordField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={shown?.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          autoComplete="new-password"
          textContentType="newPassword"
          testID="sign-up-password"
        />

        {legal.isPending ? (
          <View accessibilityLabel="Loading the legal documents" testID="sign-up-legal-loading">
            <SkeletonList rows={2} rowHeight={40} />
          </View>
        ) : legal.isError && items.length === 0 ? (
          <ErrorState
            compact
            testID="sign-up-legal-error"
            error={legal.error}
            title="We could not load the terms"
            onRetry={() => void legal.refetch()}
          />
        ) : (
          <LegalConsentList
            items={items}
            accepted={accepted}
            onChange={setAccepted}
            showError={submitted && errors.consents !== null}
          />
        )}

        <Button
          label="Create account"
          loading={step !== null}
          loadingLabel={step ? STEP_LABELS[step] : undefined}
          disabled={items.length === 0 || google.busy}
          onPress={() => void onSubmit()}
          testID="sign-up-submit"
        />
        <OrDivider />
        <GoogleButton
          label="Sign up with Google"
          busy={google.busy}
          disabled={step !== null || !!session.initError}
          onPress={() => void onGoogle()}
          testID="sign-up-google"
        />
      </View>
      <SimulatedGoogleAccountDialog {...google.dialog} />

      <View style={styles.footer}>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          Already have an account?
        </Text>
        <Link
          href="/sign-in"
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[1],
    marginTop: spacing[8],
  },
  link: { fontWeight: fontWeight.semibold },
});
