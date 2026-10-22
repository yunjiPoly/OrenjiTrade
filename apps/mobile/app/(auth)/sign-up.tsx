import { Link, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useFlowLock } from '@/src/account/flowLock';
import {
  MIN_PASSWORD_LENGTH,
  SIGN_UP_BLOCKER_LINES,
  hasErrors,
  register,
  requiredAtRegistration,
  signUpBlocker,
  validateSignUp,
} from '@/src/account/registration';
import { isApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useLegalDocuments } from '@/src/api/hooks/legal';
import { authErrorMessage } from '@/src/auth/authErrors';
import { useSession } from '@/src/auth/session';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage, PasswordField } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { SIGN_UP_COPY } from '@/src/features/auth/authCopy';
import { GoogleButton, OrDivider } from '@/src/features/auth/GoogleButton';
import { SimulatedGoogleAccountDialog } from '@/src/features/auth/SimulatedGoogleAccountDialog';
import { googleErrorMessage, useGoogleSignIn } from '@/src/features/auth/useGoogleSignIn';
import { ageConfirmationOf } from '@/src/features/legal/ageConfirmation';
import { AgeConfirmationCheckbox } from '@/src/features/legal/AgeConfirmationCheckbox';
import { LegalConsentList } from '@/src/features/legal/LegalConsentList';
import type { ConsentItem } from '@/src/features/legal/legalDocs';
import { legalKeyOf } from '@/src/features/legal/legalDocs';
import { useLegalLanguage } from '@/src/features/legal/legalLanguage';
import { legalTitleOf } from '@/src/features/legal/legalTexts';
import { fontWeight, spacing, textStyle, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

/**
 * 37 Create your account (stage R12, mockup v50): display name, email + password, the documents
 * required at registration in one card ("Accept all", then each with its box and "Read"; versions
 * from the API, texts readable in-app) and the 18+ confirmation in its own card (never ticked by
 * "Accept all", recorded as the `AGE_CONFIRMATION` consent), then a verification email (web:
 * `/auth/sign-up`). "Create account" stays disabled until every box is ticked, with one line under
 * it saying what is missing; the fields are checked when it is pressed, and the server checks
 * stay. The auth gate is held until the consents are recorded. "Sign up with Google" signs in
 * with Google instead; Review our terms (43) then collects the documents and the 18+
 * confirmation, exactly like the web.
 */
export default function SignUpScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  const account = useAccount();
  const legal = useLegalDocuments();
  const { language } = useLegalLanguage();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState<string[]>([]);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState<keyof typeof SIGN_UP_COPY.steps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const google = useGoogleSignIn('sign-in');

  const documents = useMemo(() => requiredAtRegistration(legal.data ?? []), [legal.data]);
  const ageConfirmation = useMemo(() => ageConfirmationOf(legal.data), [legal.data]);
  const items = useMemo<ConsentItem[]>(
    () =>
      documents.map((document) => {
        const key = legalKeyOf(document.url);
        return {
          documentType: document.documentType,
          version: document.version,
          title: legalTitleOf(key, language, document.title),
          key,
        };
      }),
    [documents, language]
  );

  const errors = validateSignUp(
    { displayName, email, password, acceptedDocumentTypes: accepted, ageConfirmed },
    documents,
    ageConfirmation
  );
  const shown = submitted ? errors : null;
  const ready = items.length > 0;
  const blocker = ready
    ? signUpBlocker({
        requiredDocuments: documents,
        acceptedDocumentTypes: accepted,
        ageNeeded: ageConfirmation !== null,
        ageConfirmed,
      })
    : null;

  const onSubmit = async () => {
    setSubmitted(true);
    if (hasErrors(errors)) {
      return;
    }
    setError(null);
    const flowLock = useFlowLock.getState();
    flowLock.lock('sign-up');
    try {
      await register(
        { displayName, email, password },
        documents,
        {
          signUp: (value, secret, name) => session.signUp(value, secret, name),
          currentEmail: () => session.user?.email ?? null,
          acceptConsents: account.acceptConsents,
          sendEmailVerification: session.sendEmailVerification,
          onStep: setStep,
        },
        ageConfirmation
      );
      // The verify-email screen releases the gate once it is shown.
      router.replace('/verify-email');
    } catch (caught) {
      flowLock.unlock();
      setError(isApiError(caught) ? friendlyMessage(caught) : authErrorMessage(caught));
    } finally {
      setStep(null);
    }
  };

  /** Google sign-up: Review our terms collects the legal acceptance afterwards (the gate). */
  const onGoogle = async () => {
    setError(null);
    try {
      await google.start();
    } catch (caught) {
      setError(googleErrorMessage(caught));
    }
  };

  return (
    <Screen scroll safeBottom testID="screen-sign-up" contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[textStyle('2xl', 'heading'), styles.title, { color: palette.ink }]}
        >
          {SIGN_UP_COPY.title}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{SIGN_UP_COPY.intro}</Text>
      </View>

      <View style={styles.form}>
        {session.initError ? (
          <FormMessage tone="info">{SIGN_UP_COPY.notConfigured}</FormMessage>
        ) : null}
        {error ? <FormMessage testID="sign-up-error">{error}</FormMessage> : null}
        <TextField
          label={SIGN_UP_COPY.displayName}
          value={displayName}
          onChangeText={setDisplayName}
          error={shown?.displayName}
          hint={SIGN_UP_COPY.displayNameHint}
          autoComplete="nickname"
          maxLength={80}
          testID="sign-up-display-name"
        />
        <TextField
          label={SIGN_UP_COPY.email}
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
          label={SIGN_UP_COPY.password}
          value={password}
          onChangeText={setPassword}
          error={shown?.password}
          hint={SIGN_UP_COPY.passwordHint(MIN_PASSWORD_LENGTH)}
          autoComplete="new-password"
          textContentType="newPassword"
          testID="sign-up-password"
        />

        {legal.isPending ? (
          <View accessibilityLabel={SIGN_UP_COPY.documentsLoading} testID="sign-up-legal-loading">
            <SkeletonList rows={3} rowHeight={44} />
          </View>
        ) : legal.isError && items.length === 0 ? (
          <ErrorState
            compact
            testID="sign-up-legal-error"
            error={legal.error}
            title={SIGN_UP_COPY.documentsError}
            onRetry={() => void legal.refetch()}
          />
        ) : (
          <>
            <LegalConsentList items={items} accepted={accepted} onChange={setAccepted} />
            {ageConfirmation ? (
              <AgeConfirmationCheckbox
                checked={ageConfirmed}
                onChange={setAgeConfirmed}
                disabled={step !== null}
              />
            ) : null}
          </>
        )}

        <View style={styles.actions}>
          <PillButton
            label={SIGN_UP_COPY.submit}
            loading={step !== null}
            loadingLabel={step ? SIGN_UP_COPY.steps[step] : undefined}
            disabled={!ready || blocker !== null || google.busy}
            accessibilityHint={blocker ? SIGN_UP_BLOCKER_LINES[blocker] : undefined}
            onPress={() => void onSubmit()}
            testID="sign-up-submit"
          />
          {blocker ? (
            <Text
              testID="sign-up-blocker"
              style={[textStyle('xs'), styles.blocker, { color: palette.textMuted }]}
            >
              {SIGN_UP_BLOCKER_LINES[blocker]}
            </Text>
          ) : null}
          <OrDivider />
          <GoogleButton
            label={SIGN_UP_COPY.google}
            busy={google.busy}
            disabled={step !== null || !!session.initError}
            onPress={() => void onGoogle()}
            testID="sign-up-google"
          />
          <View style={styles.footer}>
            <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
              {SIGN_UP_COPY.haveAccount}
            </Text>
            <Link
              href="/sign-in"
              replace
              accessibilityRole="link"
              style={[textStyle('sm'), styles.link, { color: palette.primary }]}
              testID="sign-up-sign-in"
            >
              {SIGN_UP_COPY.signIn}
            </Link>
          </View>
        </View>
      </View>
      <SimulatedGoogleAccountDialog {...google.dialog} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing[5], paddingTop: spacing[1] },
  header: { gap: 6, marginBottom: 14 },
  title: { fontWeight: fontWeight.bold, letterSpacing: -0.3 },
  form: { gap: 14 },
  actions: { gap: spacing[2] },
  blocker: { textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 6,
    marginTop: spacing[1],
  },
  link: { fontWeight: fontWeight.bold, paddingVertical: spacing[3] },
});
